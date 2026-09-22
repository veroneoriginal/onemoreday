"""
Минимальный HTTP-сервер на стандартной библиотеке Python (без зависимостей).

Поднимает один endpoint:
    GET /api/until?date=2028-07-17  ->  {"years": 1, "months": 9, ..., "total_days": 664}

Это и есть "бэкенд": он принимает запрос от фронтенда, считает время
до события через age_calculator и возвращает результат в формате JSON.

Запуск:
    python backend/server.py
Сервер слушает http://localhost:8000
"""

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

from age_calculator import calculate_until, parse_date

# Из интернета к бэкенду напрямую не достучаться:
# снаружи запросы принимает nginx и уже он передаёт их сюда.
HOST = "127.0.0.1"
PORT = 8000


class UntilRequestHandler(BaseHTTPRequestHandler):
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

        if parsed.path != "/api/until":
            self._send_json(404, {"error": "Неизвестный путь"})
            return

        # Достаём параметр ?date=... из строки запроса
        params = parse_qs(parsed.query)
        raw_date = params.get("date", [None])[0]

        if raw_date is None:
            self._send_json(400, {"error": "Не передан параметр 'date'"})
            return

        try:
            target = parse_date(text=raw_date)
            result = calculate_until(target=target)
        except ValueError as e:
            # Либо дата не распарсилась, либо calculate_until её отверг
            self._send_json(400, {"error": str(e) or "Некорректная дата"})
            return

        self._send_json(200, result)

    def log_message(self, fmt, *args):
        # Компактный лог запросов в консоль
        print(f"[backend] {self.address_string()} - {fmt % args}")


def main():
    # ThreadingHTTPServer, а не HTTPServer: браузер открывает про запас лишние
    # соединения и ничего в них не шлёт. Однопоточный сервер вставал бы на таком
    # пустом сокете и переставал отвечать на настоящие запросы.
    server = ThreadingHTTPServer((HOST, PORT), UntilRequestHandler)
    server.daemon_threads = True  # чтобы Ctrl+C не ждал зависшие соединения
    print(f"Бэкенд запущен на http://{HOST}:{PORT}")
    print("Endpoint: GET /api/until?date=2028-07-17")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nОстановка сервера...")
        server.server_close()


if __name__ == "__main__":
    main()
