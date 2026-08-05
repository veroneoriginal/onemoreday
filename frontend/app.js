// Здесь живёт вся логика фронтенда: состояние формы и запрос к бэкенду.
// Как фронт общается с бэком - функции calculate() и вызов fetch().

const { createApp } = Vue;

// Адрес нашего бэкенда — относительный, без имени сайта.
// Браузер сам подставит тот адрес, с которого открыта страница:
// на onemoreday.fun запрос уйдёт на https://onemoreday.fun/api/age.
// Дальше nginx увидит префикс /api/ и передаст запрос Python-бэкенду.
const BACKEND_URL = "/api/age";

// Адрес сервиса: он попадает в QR-код и в кнопку «Поделиться» на последнем экране.
// Зашит намеренно, а не берётся из window.location.origin: с localhost человек
// поделился бы ссылкой, которая ни у кого, кроме него, не открывается.
const SITE_URL = "https://onemoreday.fun";

// Окончания для пожелания на день — одно выбирается наугад по кнопке «Понятно».
// Фраза собирается как "Так пусть же он будет ...", поэтому все варианты
// стоят в творительном падеже.
const WISHES = [
  "тёплым и неторопливым",
  "щедрым на хорошие новости",
  "лёгким — и пусть всё задуманное успеется",
  "спокойным, как утро без будильника",
  "полным мелочей, от которых улыбаешься",
  "таким, чтобы вечером сказать: хороший был день",
  "добрым к вам — и вы к себе тоже",
  "без спешки и с чашкой чего-нибудь вкусного",
  "интересным настолько, чтобы его запомнить",
  "наполненным людьми, с которыми легко",
];

createApp({
  // data() — реактивное состояние компонента
  data() {
    return {
      // Восемь клеток ДДММГГГГ: по одной цифре в каждой
      digits: ["", "", "", "", "", "", "", ""],
      cellLabels: [
        "день, первая цифра", "день, вторая цифра",
        "месяц, первая цифра", "месяц, вторая цифра",
        "год, цифра 1", "год, цифра 2", "год, цифра 3", "год, цифра 4",
      ],
      result: null,   // ответ от бэкенда (объект с годами/днями/...)
      error: "",      // текст ошибки, если что-то пошло не так
      loading: false, // идёт ли сейчас запрос
      // Какой из трёх экранов сейчас на карточке:
      // 'form' — ввод и подсчёт, 'wish' — пожелание, 'share' — QR-код
      screen: "form",
      wish: "",       // текст пожелания на день
      wishDate: "",   // сегодняшняя дата на момент нажатия «Понятно»
      qrDataUrl: "",  // картинка QR-кода, собирается при переходе на 'share'
      shareError: "", // если генератор QR-кода не загрузился
      copied: false,  // ссылку только что скопировали — на пару секунд меняем текст кнопки
    };
  },

  computed: {
    // Заголовок карточки — у каждого из трёх экранов свой
    title() {
      if (this.screen === "form") return "Сколько Вы прожили?";
      if (this.screen === "wish") return "Пожелание на день";
      return "Хорошего дня!";
    },

    // Все восемь клеток заполнены?
    isComplete() {
      return this.digits.every((d) => d !== "");
    },

    // Нечего очищать: пустые клетки и нет ни результата, ни ошибки
    isEmpty() {
      return this.digits.every((d) => d === "") && !this.result && !this.error;
    },

    // Дата пожелания "29.07.2026" -> ["2","9","0","7","2","0","2","6"],
    // чтобы разложить её по тем же клеткам, что и в форме
    todayDigits() {
      return this.wishDate.replace(/\D/g, "").split("");
    },

    // ДДММГГГГ -> ГГГГ-ММ-ДД, в таком виде дату ждёт бэкенд
    isoDate() {
      const s = this.digits.join("");
      return `${s.slice(4, 8)}-${s.slice(2, 4)}-${s.slice(0, 2)}`;
    },

    // Ответ бэкенда -> список кусочков для вывода: [{ value: 33, label: "года" }, ...]
    ageParts() {
      if (!this.result) return [];

      const units = [
        [this.result.years, ["год", "года", "лет"]],
        [this.result.months, ["месяц", "месяца", "месяцев"]],
        [this.result.days, ["день", "дня", "дней"]],
        [this.result.hours, ["час", "часа", "часов"]],
        [this.result.minutes, ["минута", "минуты", "минут"]],
        [this.result.seconds, ["секунда", "секунды", "секунд"]],
      ];

      // Ведущие нули не показываются: "0 лет, 0 месяцев, 3 дня" читается странно.
      // Если ноль вообще всё (родился сегодня в полночь) — оставить секунды.
      const first = units.findIndex(([n]) => n > 0);
      const shown = first === -1 ? units.slice(-1) : units.slice(first);

      return shown.map(([n, forms]) => ({
        value: n,
        label: this.plural(n, ...forms),
      }));
    },
  },

  methods: {
    // --- Управление клетками ------------------------------------------

    focusCell(i) {
      // На экранах пожелания и QR-кода клеток нет — refs пустые
      const input = this.$refs.cells && this.$refs.cells[i];
      if (input) {
        input.focus();
        input.select();
      }
    },

    // Ввод символа в клетку.
    onInput(event, i) {
      const typed = event.target.value.replace(/\D/g, "");

      // Взять последний введённый символ: если в клетке уже была цифра
      // и пользователь напечатал поверх, должна остаться новая
      this.digits[i] = typed ? typed[typed.length - 1] : "";

      // Vue не перерисует input, если digits[i] не изменился
      // (напечатали букву в пустую клетку) — поправить DOM вручную
      event.target.value = this.digits[i];

      // Автопереход к следующей клетке
      if (this.digits[i] && i < 7) {
        this.focusCell(i + 1);
      }
    },

    onKeydown(event, i) {
      if (event.key === "Enter") {
        this.calculate();
        return;
      }

      // Backspace в пустой клетке — вернуться назад и стереть там
      if (event.key === "Backspace" && !this.digits[i] && i > 0) {
        event.preventDefault();
        this.digits[i - 1] = "";
        this.focusCell(i - 1);
        return;
      }

      // Стрелками ходим между клетками
      if (event.key === "ArrowLeft" && i > 0) {
        event.preventDefault();
        this.focusCell(i - 1);
      }
      if (event.key === "ArrowRight" && i < 7) {
        event.preventDefault();
        this.focusCell(i + 1);
      }
    },

    // Вставка из буфера: "01.01.2000" разложится по клеткам,
    // начиная с той, в которой стоит курсор
    onPaste(event, i) {
      event.preventDefault();
      const pasted = (event.clipboardData || window.clipboardData)
        .getData("text")
        .replace(/\D/g, "");

      // Полную дату всегда кладём с начала, обрывок — с текущей клетки
      const start = pasted.length >= 8 ? 0 : i;

      for (let n = 0; n < pasted.length && start + n < 8; n++) {
        this.digits[start + n] = pasted[n];
      }

      this.focusCell(Math.min(start + pasted.length, 7));
    },

    // --- Показ результата ---------------------------------------------

    // Русские числительные: "31 год", "33 года", "12 278 дней"
    plural(n, one, few, many) {
      const mod10 = n % 10;
      const mod100 = n % 100;
      if (mod100 >= 11 && mod100 <= 14) return many;
      if (mod10 === 1) return one;
      if (mod10 >= 2 && mod10 <= 4) return few;
      return many;
    },

    // Кнопка «Понятно» под подсчётом: подсчёт сменяется пожеланием на день.
    // Дату берём в момент нажатия, а не заранее — страница может провисеть
    // открытой до следующих суток.
    showWish() {
      this.wishDate = new Date().toLocaleDateString("ru-RU");
      this.wish = WISHES[Math.floor(Math.random() * WISHES.length)];
      this.screen = "wish";
    },

    // Кнопка «Спасибо»: последний экран с QR-кодом.
    // Код рисуем здесь, а не заранее — пока на него не смотрят, он не нужен.
    showShare() {
      if (typeof qrcode === "undefined") {
        // Библиотека тянется с CDN — без интернета её не будет.
        // Отдельное поле, а не error: тот показывается только на форме
        this.shareError = "Не удалось загрузить генератор QR-кода";
        return;
      }

      const qr = qrcode(0, "M"); // 0 — размер подберётся сам, "M" — запас на помехи
      qr.addData(SITE_URL);
      qr.make();

      this.qrDataUrl = qr.createDataURL(6, 4); // размер клетки и поля вокруг
      this.screen = "share";
    },

    // Кнопка «Поделиться»: отдаём ссылку на сервис.
    // На телефоне — системному меню «Поделиться», на компьютере такого меню
    // обычно нет, поэтому просто кладём ссылку в буфер обмена.
    async share() {
      this.shareError = "";

      if (navigator.share) {
        try {
          await navigator.share({
            title: "Ещё один день",
            text: "Сегодня к сумме Вашей жизни добавляется ещё один день.",
            url: SITE_URL,
          });
          return;
        } catch (e) {
          // Меню закрыли, не выбрав куда отправить — это не ошибка, молчим
          if (e.name === "AbortError") return;
          // Что-то другое — пробуем скопировать в буфер, как на компьютере
        }
      }

      try {
        await navigator.clipboard.writeText(SITE_URL);
        this.copied = true;
        // Возвращаем обычную надпись, чтобы кнопкой можно было нажать снова
        setTimeout(() => { this.copied = false; }, 2000);
      } catch (e) {
        // Буфер обмена браузер даёт только на https и localhost
        this.shareError = "Не удалось скопировать ссылку: " + SITE_URL;
      }
    },

    // Сбросить всё и начать заново — чтобы посчитать другую дату.
    // Массив заменяем целиком: так Vue гарантированно перерисует клетки.
    reset() {
      this.digits = ["", "", "", "", "", "", "", ""];
      this.result = null;
      this.error = "";
      this.wish = "";
      this.qrDataUrl = "";
      this.shareError = "";
      this.copied = false;
      this.screen = "form";
      // Ждём перерисовку, иначе фокус уйдёт в ещё не обновлённую клетку
      this.$nextTick(() => this.focusCell(0));
    },

    // --- Запрос к бэкенду ---------------------------------------------

    // Вызывается по кнопке "Посчитать" или по Enter
    async calculate() {
      this.error = "";
      this.result = null;

      if (!this.isComplete) {
        this.error = "Введите дату рождения полностью";
        return;
      }

      this.loading = true;

      // Ограничиваем ожидание: если бэкенд не отвечает, кнопка не должна
      // висеть в "Считаю…" бесконечно — через 10 секунд обрываем запрос
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);

      try {
        // фронтенд отправляет HTTP-запрос на бэкенд.
        // Дату передаём в строке запроса: /api/age?birthdate=1992-12-16
        const response = await fetch(`${BACKEND_URL}?birthdate=${this.isoDate}`, {
          signal: controller.signal,
        });

        // Бэкенд отвечает JSON-ом — разбираем его
        const data = await response.json();

        if (!response.ok) {
          // Бэкенд вернул ошибку (например, статус 400) с полем error.
          // Существует ли такая дата, не в будущем ли она — решает бэкенд,
          // фронт только показывает его ответ
          this.error = data.error || "Что-то пошло не так";
          return;
        }

        // Успех: сохраняем результат, Vue сам перерисует разметку
        this.result = data;
      } catch (e) {
        // Сюда попадаем, если бэкенд не запущен, завис или нет сети
        this.error =
          e.name === "AbortError"
            ? "Бэкенд не ответил за 10 секунд. Он запущен?"
            : "Не удалось связаться с сервером. Запущен ли бэкенд?";
      } finally {
        clearTimeout(timer);
        this.loading = false;
      }
    },
  },

  // При загрузке страницы сразу ставим курсор в первую клетку
  mounted() {
    this.focusCell(0);
  },
}).mount("#app");