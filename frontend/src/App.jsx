import { Fragment, useEffect, useRef, useState } from "react";
import qrcode from "qrcode-generator";

// Адрес сервиса попадает в QR-код и в кнопку «Поделиться».
// Зашит намеренно, а не берётся из window.location.origin: с localhost человек
// поделился бы ссылкой, которая ни у кого, кроме него, не открывается.
const SITE_URL = "https://onemoreday.fun";

// Относительный адрес: браузер подставит тот хост, с которого открыта страница.
// Локально Vite пересылает /api на Python, на сервере это сделает nginx.
const BACKEND_URL = "/api/until";

const EMPTY_DIGITS = ["", "", "", "", "", "", "", ""];

const CELL_LABELS = [
  "день, первая цифра",
  "день, вторая цифра",
  "месяц, первая цифра",
  "месяц, вторая цифра",
  "год, цифра 1",
  "год, цифра 2",
  "год, цифра 3",
  "год, цифра 4",
];

// Пожелания на день — одно выбирается наугад по кнопке «Получить поддержку».
// Идёт вторым абзацем после постоянной фразы.
const WISHES = [
  "Иногда достаточно сделать предложение, от которого невозможно отказаться. Особенно если предложение — выпить чаю и всё пережить.",
  "Да пребудет с тобой Сила. Особенно сегодня.",
  "Помните: после дождя выглядывает солнце. А если не выглянуло — значит, сегодня не тот день и вы тому не причина и не вина.",
  "Помните, что у всего есть год спустя.",
  "Не всё потеряно. Возможно, вы просто ещё не дошли до той серии, где всё начинает налаживаться.",
  "Иногда нужно просто дать себе время. Даже Шерлок не раскрыл бы дело за пять минут.",
  "Свеча не становится меньше, если зажечь от неё другую.",
  "Вы крепче, чем кажется сегодня.",
  "Если дверь не откроется с первой попытки — это значит лишь, что неправильно подобран ключ.",
  "Свет в конце тоннеля не обязан быть ярким. Иногда достаточно, чтобы просто было видно следующий шаг.",
];

function isoDate(digits) {
  const s = digits.join("");
  return `${s.slice(4, 8)}-${s.slice(2, 4)}-${s.slice(0, 2)}`;
}

function titleFor(screen) {
  if (screen === "welcome") return "Хорошо, что Вы здесь";
  if (screen === "form") return "Введите дату ожидаемого события";
  if (screen === "result") return "Важное событие случится через:";
  if (screen === "wish") return "Пожелание на день";
  return "Хорошего дня!";
}

// Русские числительные: "31 год", "33 года", "12 278 дней".
// Подписи к числам из ответа бэкенда.
function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function ageParts(result) {
  const units = [
    [result.years, ["год", "года", "лет"]],
    [result.months, ["месяц", "месяца", "месяцев"]],
    [result.days, ["день", "дня", "дней"]],
    [result.hours, ["час", "часа", "часов"]],
    [result.minutes, ["минута", "минуты", "минут"]],
    [result.seconds, ["секунда", "секунды", "секунд"]],
  ];

  // Ведущие нули не показываются: "0 лет, 0 месяцев, 3 дня" читается странно.
  const first = units.findIndex(([n]) => n > 0);
  const shown = first === -1 ? units.slice(-1) : units.slice(first);

  return shown.map(([n, forms]) => ({
    value: n,
    label: plural(n, ...forms),
  }));
}

function DateCells({ digits, readOnly, cellRefs, onInput, onKeyDown, onPaste }) {
  return (
    <div className="date-fields">
      {digits.map((digit, i) => (
        <Fragment key={i}>
          {(i === 2 || i === 4) && <span className="dot">.</span>}
          {readOnly ? (
            <span className="cell readonly">{digit}</span>
          ) : (
            <input
              ref={(el) => {
                cellRefs.current[i] = el;
              }}
              className="cell"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={1}
              aria-label={CELL_LABELS[i]}
              value={digit}
              onChange={(event) => onInput(event, i)}
              onKeyDown={(event) => onKeyDown(event, i)}
              onPaste={(event) => onPaste(event, i)}
              onFocus={(event) => event.target.select()}
            />
          )}
        </Fragment>
      ))}
    </div>
  );
}

export default function App() {
  const [digits, setDigits] = useState(EMPTY_DIGITS);
  const [screen, setScreen] = useState("welcome");
  const [error, setError] = useState("");
  const [wish, setWish] = useState("");
  const [wishDate, setWishDate] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [shareError, setShareError] = useState("");
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const cellRefs = useRef([]);

  const isComplete = digits.every((d) => d !== "");
  const isEmpty = digits.every((d) => d === "") && !error;
  const todayDigits = wishDate.replace(/\D/g, "").split("");

  function focusCell(i) {
    const input = cellRefs.current[i];
    if (!input) return;
    input.focus();
    input.select();
  }

  useEffect(() => {
    if (screen === "form") focusCell(0);
  }, [screen]);

  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    document.getElementById(id)?.scrollIntoView();
  }, []);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  function onInput(event, i) {
    const typed = event.target.value.replace(/\D/g, "");
    const next = typed ? typed[typed.length - 1] : "";
    setDigits((prev) => {
      const copy = [...prev];
      copy[i] = next;
      return copy;
    });
    if (next && i < 7) focusCell(i + 1);
  }

  function onKeyDown(event, i) {
    if (event.key === "Enter") {
      calculate();
      return;
    }
    if (event.key === "Backspace" && !digits[i] && i > 0) {
      event.preventDefault();
      setDigits((prev) => {
        const copy = [...prev];
        copy[i - 1] = "";
        return copy;
      });
      focusCell(i - 1);
      return;
    }
    if (event.key === "ArrowLeft" && i > 0) {
      event.preventDefault();
      focusCell(i - 1);
    }
    if (event.key === "ArrowRight" && i < 7) {
      event.preventDefault();
      focusCell(i + 1);
    }
  }

  function onPaste(event, i) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "");
    const start = pasted.length >= 8 ? 0 : i;
    setDigits((prev) => {
      const copy = [...prev];
      for (let n = 0; n < pasted.length && start + n < 8; n += 1) {
        copy[start + n] = pasted[n];
      }
      return copy;
    });
    focusCell(Math.min(start + pasted.length, 7));
  }

  function showForm() {
    setScreen("form");
  }

  function showWish() {
    setWishDate(new Date().toLocaleDateString("ru-RU"));
    setWish(WISHES[Math.floor(Math.random() * WISHES.length)]);
    setShareError("");
    setScreen("wish");
  }

  function showShare() {
    try {
      const qr = qrcode(0, "M");
      qr.addData(SITE_URL);
      qr.make();
      setQrDataUrl(qr.createDataURL(6, 4));
      setShareError("");
      setScreen("share");
    } catch {
      setShareError("Не удалось собрать QR-код");
    }
  }

  async function share() {
    setShareError("");
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Ещё один день",
          text: "Сегодня к сумме Вашей жизни добавляется ещё один день.",
          url: SITE_URL,
        });
        return;
      } catch (e) {
        if (e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(SITE_URL);
      setCopied(true);
    } catch {
      setShareError(`Не удалось скопировать ссылку: ${SITE_URL}`);
    }
  }

  function clearFields() {
    setDigits([...EMPTY_DIGITS]);
    setError("");
    setResult(null);
    setWish("");
    setWishDate("");
    setQrDataUrl("");
    setShareError("");
    setCopied(false);
    setLoading(false);
  }

  function reset() {
    clearFields();
    setScreen("form");
    requestAnimationFrame(() => focusCell(0));
  }

  function goHome() {
    clearFields();
    setScreen("welcome");
  }

  // Единственное место, где страница говорит с бэкендом.
  // Дата уходит строкой запроса: /api/until?date=2028-07-17
  async function calculate() {
    setError("");
    setResult(null);
    if (!isComplete) {
      setError("Введите дату полностью");
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${BACKEND_URL}?date=${isoDate(digits)}`, {
        signal: controller.signal,
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Что-то пошло не так");
        return;
      }

      setResult(data);
      setScreen("result");
    } catch (e) {
      setError(
        e.name === "AbortError"
          ? "Бэкенд не ответил за 10 секунд. Он запущен?"
          : "Не удалось связаться с сервером. Запущен ли бэкенд?",
      );
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  return (
    <>
      <section id="sidebar">
        <div className="inner">
          <nav>
            <ul>
              <li><a href="#intro">Начало</a></li>
              <li><a href="#what">Что мы делаем</a></li>
              <li><a href="#support">Поддержка</a></li>
              <li><a href="#courses">Курсы</a></li>
              <li><a href="#subscribe">Контакты</a></li>
            </ul>
          </nav>
        </div>
      </section>

      <div id="wrapper">
        <section id="intro" className="wrapper style1 fullscreen fade-up">
          <div className="inner">
            <h1>One More Day — пространство для себя</h1>
            <p>Поддержка, образовательные материалы и инструменты самопознания,<br />
            которые помогают лучше понимать себя и повседневную жизнь</p>
          </div>
        </section>

        <section id="what" className="wrapper style3 fade-up">
          <div className="inner">
            <h2>Что мы делаем</h2>
            <p>Мы объединяем доступные знания, практические материалы и небольшие инструменты, которые помогают лучше ориентироваться в повседневной жизни. Наша задача — сделать полезную информацию понятной, доступной и применимой на практике.</p>
            <div className="features">
              <section>
                <h3>Понятно объясняем</h3>
                <p>Переводим сложные идеи и концепции на доступный язык, без лишней терминологии и перегруженных объяснений.</p>
              </section>
              <section>
                <h3>Делаем знания практичными</h3>
                <p>Предлагаем не только теорию, но и конкретные подходы, упражнения и идеи, которые можно использовать в жизни.</p>
              </section>
              <section>
                <h3>Создаём возможности для обучения</h3>
                <p>Разрабатываем образовательные материалы, которые можно изучать самостоятельно, в комфортном темпе и без привязки к расписанию.</p>
              </section>
              <section>
                <h3>Оставляем пространство для своего выбора</h3>
                <p>Не навязываем универсальных решений. Помогаем знакомиться с новыми идеями и самостоятельно выбирать то, что подходит именно вам.</p>
              </section>
            </div>
          </div>
        </section>

        <section id="support" className="wrapper style1 fade-up">
          <div className="inner">
            {screen === "welcome" && (
              <div className="support-welcome">
                <h2>{titleFor(screen)}</h2>
                <p>Иногда нужна поддержка. Иногда — возможность остановиться и вспомнить о чём-то важном. Здесь можно найти несколько добрых слов для себя или посчитать время до события, которого вы ждёте.</p>
                <div className="support-choices">
                  <article className="support-choice">
                    <h3>Получить поддержку</h3>
                    <p>Небольшое напоминание, которое может оказаться кстати именно сегодня.</p>
                    <button className="button" type="button" onClick={showWish}>
                      Получить
                    </button>
                  </article>
                  <article className="support-choice">
                    <h3>Посчитать важную дату</h3>
                    <p>Узнайте, сколько времени осталось до события, которое вы с нетерпением ждёте.</p>
                    <button className="button" type="button" onClick={showForm}>
                      Посчитать
                    </button>
                  </article>
                </div>
              </div>
            )}

            {screen !== "welcome" && (
            <div className="split style1">
              <section className="support-block">
                <h2>{titleFor(screen)}</h2>

                {screen === "form" && (
                  <>
                    <p className="subtitle">А мы всё посчитаем)</p>
                    <DateCells
                      digits={digits}
                      cellRefs={cellRefs}
                      onInput={onInput}
                      onKeyDown={onKeyDown}
                      onPaste={onPaste}
                    />
                    <p className="hint">день · месяц · год</p>
                    {error && <p className="error">{error}</p>}
                  </>
                )}

                {screen === "result" && result && (
                  <ul className="age">
                    {ageParts(result).map((part) => (
                      <li key={part.label}>
                        <b>{part.value}</b> {part.label}
                      </li>
                    ))}
                  </ul>
                )}

                {screen === "wish" && (
                  <>
                    <DateCells digits={todayDigits} readOnly />
                    <div className="wish-box">
                      <p>Сегодня к сумме Вашей жизни добавляется ещё один день.</p>
                      <p>{wish}</p>
                    </div>
                    {shareError && <p className="error">{shareError}</p>}
                  </>
                )}

                {screen === "share" && (
                  <>
                    <img className="qr" src={qrDataUrl} alt="QR-код со ссылкой на этот сайт" />
                    <p className="share-text">
                      Поделитесь хорошим настроением с теми, кто Вам дорог!
                    </p>
                    {shareError && <p className="error">{shareError}</p>}
                  </>
                )}
              </section>

              <section>
                <ul className="actions stacked">
                  {screen === "form" && (
                    <>
                      <li>
                        <button className="button primary fit" type="button" onClick={calculate} disabled={loading}>
                          {loading ? "Считаю…" : "Посчитать"}
                        </button>
                      </li>
                      <li>
                        <button className="button fit" type="button" onClick={reset} disabled={loading || isEmpty}>
                          Очистить
                        </button>
                      </li>
                    </>
                  )}
                  {(screen === "result" || screen === "wish") && (
                    <li>
                      <button className="button primary fit" type="button" onClick={showShare}>
                        Спасибо
                      </button>
                    </li>
                  )}
                  {screen === "share" && (
                    <>
                      <li>
                        <button className="button primary fit" type="button" onClick={goHome}>
                          В начало
                        </button>
                      </li>
                      <li>
                        <button className="button fit" type="button" onClick={share}>
                          {copied ? "Ссылка скопирована" : "Поделиться"}
                        </button>
                      </li>
                    </>
                  )}
                </ul>
              </section>
            </div>
            )}
          </div>
        </section>

        <section id="courses" className="wrapper style2 spotlights">
          <section>
            <a
              href="#"
              className="image"
              onClick={(event) => event.preventDefault()}
              style={{ backgroundImage: "url(/images/pic01.jpg)", backgroundPosition: "center center" }}
            >
              <img src="/images/pic01.jpg" alt="" />
            </a>
            <div className="content">
              <div className="inner">
                <h2>Постановка целей и личная эффективность</h2>
                <p>Практический курс для тех, кто хочет научиться не просто мечтать, а планировать и достигать свои цели, эффективно управлять временем, преодолевать прокрастинацию и формировать полезные привычки. Курс поможет превратить развитие из теории в конкретные действия, которые ведут к реальным изменениям в жизни и карьере.</p>
                <ul className="actions">
                  <li><a href="https://stepik.org/a/245211" className="button" target="_blank" rel="noreferrer">Подробнее</a></li>
                </ul>
              </div>
            </div>
          </section>
          <section>
            <a
              href="#"
              className="image"
              onClick={(event) => event.preventDefault()}
              style={{ backgroundImage: "url(/images/pic02.jpg)", backgroundPosition: "top center" }}
            >
              <img src="/images/pic02.jpg" alt="" />
            </a>
            <div className="content">
              <div className="inner">
                <h2>Самооценка и уверенность в себе</h2>
                <p>Курс предназначен для тех, кто устал сомневаться в себе, постоянно себя критиковать и хочет наконец почувствовать внутреннюю опору.</p>
                <p>Вы научитесь разбираться, откуда берутся неуверенность и низкая самооценка, поймёте, как изменить ограничивающие установки, перестанете обесценивать себя и начнёте строить здоровые отношения с самим собой. Практические техники и примеры помогут вам уверенно действовать в любой ситуации, спокойно отстаивать свои границы и ценить себя по-настоящему.</p>
                <ul className="actions">
                  <li><a href="https://stepik.org/a/244823" className="button" target="_blank" rel="noreferrer">Подробнее</a></li>
                </ul>
              </div>
            </div>
          </section>
          <section>
            <a
              href="#"
              className="image"
              onClick={(event) => event.preventDefault()}
              style={{ backgroundImage: "url(/images/pic03.jpg)", backgroundPosition: "25% 25%" }}
            >
              <img src="/images/pic03.jpg" alt="" />
            </a>
            <div className="content">
              <div className="inner">
                <h2>Выгорание под контролем: сохраняем баланс и энергию</h2>
                <p>Этот курс поможет вам разобраться в природе профессионального и эмоционального выгорания, научиться вовремя распознавать его симптомы, выявлять внутренние и внешние причины, а главное — выстроить личную систему профилактики, восстановления и устойчивости. Вы узнаете, как сохранить баланс между работой и личной жизнью, поддерживать свою продуктивность без вреда для здоровья и предотвратить повторное выгорание в будущем.</p>
                <ul className="actions">
                  <li><a href="https://stepik.org/a/245236" className="button" target="_blank" rel="noreferrer">Подробнее</a></li>
                </ul>
              </div>
            </div>
          </section>
          <section>
            <a
              href="#"
              className="image"
              onClick={(event) => event.preventDefault()}
              style={{ backgroundImage: "url(/images/pic04.jpg)", backgroundPosition: "center center" }}
            >
              <img src="/images/pic04.jpg" alt="" />
            </a>
            <div className="content">
              <div className="inner">
                <h2>Эмоциональный интеллект и управление эмоциями</h2>
                <p>В современном мире умение управлять своими эмоциями и понимать эмоции других людей становится не просто полезным, а необходимым навыком. Эмоциональный интеллект напрямую влияет на качество жизни, устойчивость к стрессу, эффективность в общении и способность принимать взвешенные решения даже в напряжённых ситуациях.</p>
                <ul className="actions">
                  <li><a href="https://stepik.org/a/244446" className="button" target="_blank" rel="noreferrer">Подробнее</a></li>
                </ul>
              </div>
            </div>
          </section>
          <section>
            <a
              href="#"
              className="image"
              onClick={(event) => event.preventDefault()}
              style={{ backgroundImage: "url(/images/pic05.jpg)", backgroundPosition: "top center" }}
            >
              <img src="/images/pic05.jpg" alt="" />
            </a>
            <div className="content">
              <div className="inner">
                <h2>Как правильно завести собаку и не пожалеть об этом</h2>
                <p>Курс предназначен для тех, кто хочет завести собаку.</p>
                <p>Вы узнаете, как грамотно подготовиться к каждому этапу — от мотивации и выбора питомца до заботы о его здоровье, воспитания и сопровождения в пожилом возрасте. Этот курс поможет вам подготовиться, избежать распространённых ошибок и выстроить тёплые, уважительные отношения с собакой. Курс поможет Вам принять взвешенное и ответственное решение о том, готовы ли вы к появлению собаки в своей жизни.</p>
                <ul className="actions">
                  <li><a href="https://stepik.org/course/250228/promo" className="button" target="_blank" rel="noreferrer">Подробнее</a></li>
                </ul>
              </div>
            </div>
          </section>
        </section>

        <section id="subscribe" className="wrapper style1 fade-up">
          <div className="inner">
            <h2>Контакты</h2>
            <p>One More Day — это не только материалы и курсы. Нам важно знать, что вам интересно, отвечать на вопросы и делиться полезным.</p>
            <h3>Группа в Telegram</h3>
            <ul className="actions">
              <li>
                <a
                  href="https://t.me/+ydaSw9HsPzZlY2Ey"
                  className="button primary icon brands fa-telegram"
                  target="_blank"
                  rel="noreferrer"
                >
                  Telegram
                </a>
              </li>
            </ul>
          </div>
        </section>
      </div>

      <footer id="footer">
        <p>&copy; 2026 One More Day</p>
      </footer>
    </>
  );
}
