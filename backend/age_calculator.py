"""
Чистая логика расчёта возраста.

Здесь нет ничего про сеть или HTTP — только функция, которая берёт
дату рождения, сравнивает её с сегодняшним днём и возвращает прожитое
время в разных единицах. Такую логику легко тестировать и переиспользовать.
"""

import re
from calendar import monthrange
from datetime import date, datetime

# Строгая форма ГГГГ-ММ-ДД — чтобы отличить "не тот формат"
# от "формат тот, но такой даты не бывает" (например, 31 февраля)
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Дольше человек не живёт — всё, что больше, считаем опечаткой
MAX_AGE_YEARS = 150


def parse_birthdate(text: str) -> date:
    """
    Разобрать дату из строки 'ГГГГ-ММ-ДД'. Иначе — ValueError.
    """
    if not ISO_DATE.match(text):
        raise ValueError("Дата должна быть в формате ГГГГ-ММ-ДД")
    try:
        return date.fromisoformat(text)
    except ValueError:
        raise ValueError("Такой даты не существует")


def add_months(
        d: date,
        n: int) -> date:
    """
    Прибавить к дате n месяцев.

    Если в новом месяце нет такого числа, берём последний день месяца:
    31 января + 1 месяц = 28 февраля.
    """
    total = d.month - 1 + n
    year = d.year + total // 12
    month = total % 12 + 1
    day = min(d.day, monthrange(year, month)[1])
    return date(year, month, day)


def calculate_age(
        birthdate: date,
        now: datetime | None = None) -> dict:
    """
    Разложить прожитое время на годы, месяцы, дни, часы, минуты и секунды.

    Это разбивка: каждая следующая единица — остаток после предыдущей.
    Для 16.12.1992 на 29 июля 2026 получится 33 года, 7 месяцев, 13 дней и остаток часов.

    Параметр now нужен только для тестов: если его не передать,
    берётся текущий момент.
    """
    if now is None:
        now = datetime.now()

    # Точное время рождения мы не спрашиваем, поэтому считаем от полуночи
    born = datetime.combine(birthdate, datetime.min.time())
    if born > now:
        raise ValueError("Дата рождения не может быть в будущем")

    # 1. Сколько всего полных календарных месяцев прожито.
    # Если день месяца ещё не наступил — последний месяц не дожит, вычитаем его.
    total_months = (now.year - birthdate.year) * 12 + (now.month - birthdate.month)
    if now.day < birthdate.day:
        total_months -= 1

    # 2. Полные годы и остаток месяцев сверх них (0..11)
    years, months = divmod(total_months, 12)

    if years > MAX_AGE_YEARS:
        raise ValueError("Возраст слишком большой")

    # 3. Дата последней «месячной годовщины» — от неё считаем остаток.
    # Разницу берём в реальном времени, поэтому високосные годы и разная
    # длина месяцев учитываются сами собой.
    last_anniversary = datetime.combine(
        add_months(birthdate, total_months), datetime.min.time()
    )
    rest = now - last_anniversary

    days = rest.days
    hours, remainder = divmod(rest.seconds, 3600)
    minutes, seconds = divmod(remainder, 60)

    return {
        "years": years,
        "months": months,
        "days": days,
        "hours": hours,
        "minutes": minutes,
        "seconds": seconds,
    }
