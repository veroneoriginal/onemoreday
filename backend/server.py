"""
Минимальный HTTP-сервер на стандартной библиотеке Python (без зависимостей).

Поднимает один endpoint:
    GET /api/age?birthdate=1992-12-16  ->  {"years": 33, "months": 7, "days": 13, ...}

Это и есть "бэкенд": он принимает запрос от фронтенда, считает возраст
через age_calculator и возвращает результат в формате JSON.

Запуск:
    python backend/server.py
Сервер слушает http://localhost:8000
"""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

from age_calculator import calculate_age, parse_birthdate

# Из интернета к бэкенду напрямую не достучаться:
# снаружи запросы принимает nginx и уже он передаёт их сюда.
HOST = "127.0.0.1"
PORT = 8000


class AgeRequestHandler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, payload: dict):
        """Отправить ответ в виде JSON + заголовки CORS."""
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        # CORS: разрешаем фронтенду (другой порт) обращаться к нам
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        """Браузер шлёт OPTIONS перед запросом (preflight) — отвечаем ОК."""
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path != "/api/age":
            self._send_json(404, {"error": "Неизвестный путь"})
            return

        # Достаём параметр ?birthdate=... из строки запроса
        params = parse_qs(parsed.query)
        raw_birthdate = params.get("birthdate", [None])[0]

        if raw_birthdate is None:
            self._send_json(
                400,
                {"error": "Не передан параметр 'birthdate'"}
            )
            return

        try:
            birthdate = parse_birthdate(text=raw_birthdate)
            result = calculate_age(birthdate=birthdate)
        except ValueError as e:
            # Либо дата не распарсилась, либо calculate_age её отверг
            message = str(e) if str(e) else "Некорректная дата рождения"
            self._send_json(
                400,
                {"error": message},
            )
            return

        self._send_json(200, result)

    def log_message(self, fmt, *args):
        # Компактный лог запросов в консоль
        print(f"[backend] {self.address_string()} - {fmt % args}")


def main():
    # ThreadingHTTPServer, а не HTTPServer: браузер открывает про запас лишние
    # соединения и ничего в них не шлёт. Однопоточный сервер вставал бы на таком
    # пустом сокете и переставал отвечать на настоящие запросы.
    server = ThreadingHTTPServer((HOST, PORT), AgeRequestHandler)
    server.daemon_threads = True  # чтобы Ctrl+C не ждал зависшие соединения
    print(f"Бэкенд запущен на http://{HOST}:{PORT}")
    print("Endpoint: GET /api/age?birthdate=1992-12-16")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nОстановка сервера...")
        server.server_close()


if __name__ == "__main__":
    main()
