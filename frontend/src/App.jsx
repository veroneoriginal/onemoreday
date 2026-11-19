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
    <div className="card">
      <h1>{titleFor(screen)}</h1>

      {screen === "welcome" && (
        <>
          <div className="intro">
            <p>Иногда нам нужна поддержка.</p>
            <p>А иногда&nbsp;— просто маленькое напоминание о&nbsp;важном.</p>
          </div>
          <button className="wide" type="button" onClick={showWish}>
            Получить поддержку
          </button>
          <button className="outline wide" type="button" onClick={showForm}>
            Посчитать важную дату
          </button>
        </>
      )}

      {screen === "form" && (
        <>
          <p className="subtitle">А мы всё посчитаем)</p>
          <div className="form">
            <DateCells
              digits={digits}
              cellRefs={cellRefs}
              onInput={onInput}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
            />
            <p className="hint">день · месяц · год</p>
            <div className="buttons">
              <button type="button" onClick={calculate} disabled={loading}>
                {loading ? "Считаю…" : "Посчитать"}
              </button>
              <button
                className="secondary"
                type="button"
                onClick={reset}
                disabled={loading || isEmpty}
              >
                Очистить
              </button>
            </div>
          </div>
          {error && <p className="error">{error}</p>}
        </>
      )}

      {screen === "result" && result && (
        <div className="result">
          <ul className="age">
            {ageParts(result).map((part) => (
              <li key={part.label}>
                <b>{part.value}</b> {part.label}
              </li>
            ))}
          </ul>
          <button className="wide" type="button" onClick={showShare}>
            Спасибо
          </button>
        </div>
      )}

      {screen === "wish" && (
        <>
          <p className="subtitle"> </p>
          <DateCells digits={todayDigits} readOnly />
          <div className="wish-box">
            <p>Сегодня к сумме Вашей жизни добавляется ещё один день.</p>
            <p>{wish}</p>
          </div>
          {shareError && <p className="error">{shareError}</p>}
          <button className="wide" type="button" onClick={showShare}>
            Спасибо
          </button>
        </>
      )}

      {screen === "share" && (
        <>
          <img className="qr" src={qrDataUrl} alt="QR-код со ссылкой на этот сайт" />
          <p className="share-text">
            Поделитесь хорошим настроением с теми, кто Вам дорог!
          </p>
          {shareError && <p className="error">{shareError}</p>}
          <button className="wide" type="button" onClick={goHome}>
            В начало
          </button>
          <button className="outline wide" type="button" onClick={share}>
            {copied ? "Ссылка скопирована" : "Поделиться"}
          </button>
        </>
      )}
    </div>
  );
}
