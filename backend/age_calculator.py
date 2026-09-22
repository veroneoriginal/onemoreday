"""
Чистая логика расчёта времени до события.

Здесь нет ничего про сеть или HTTP — только функция, которая берёт
дату события, сравнивает её с текущим моментом и возвращает оставшееся
время в разных единицах. Такую логику легко тестировать и переиспользовать.
"""

import re
from calendar import monthrange
from datetime import date, datetime

# Строгая форма ГГГГ-ММ-ДД — чтобы отличить "не тот формат"
# от "формат тот, но такой даты не бывает" (например, 31 февраля)
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Ждать события дольше этого вряд ли кто-то собирается — считаем опечаткой
MAX_YEARS_AHEAD = 100


def parse_date(text: str) -> date:
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


def calculate_until(
        target: date,
        now: datetime | None = None) -> dict:
    """
    Разложить время до события на годы, месяцы, дни, часы, минуты и секунды.

    Месяцы отсчитываем вперёд от текущего момента,
    остаток добираем до полуночи дня события.
    Дополнительно total_days — сколько календарных дней осталось
    (завтра — 1, послезавтра — 2), для пожелания.

    Параметр now нужен только для тестов: если его не передать,
    берётся текущий момент.
    """
    if now is None:
        now = datetime.now()

    # Время события мы не спрашиваем, поэтому считаем до его полуночи.
    # Сегодняшняя полночь уже прошла — значит, сегодняшний день тоже не подходит.
    event = datetime.combine(target, datetime.min.time())
    if event <= now:
        raise ValueError("Выберите дату в будущем — хотя бы завтра")

    def shifted(n: int) -> datetime:
        """Текущий момент, сдвинутый на n месяцев вперёд."""
        return datetime.combine(add_months(now.date(), n), now.time())

    # 1. Сколько полных календарных месяцев помещается до события.
    # Если сдвиг перескочил через событие — последний месяц неполный, убираем его.
    total_months = (target.year - now.year) * 12 + (target.month - now.month)
    while total_months > 0 and shifted(total_months) > event:
        total_months -= 1

    # 2. Полные годы и остаток месяцев сверх них (0..11)
    years, months = divmod(total_months, 12)

    if years >= MAX_YEARS_AHEAD:
        raise ValueError("Слишком далёкая дата")

    # 3. Остаток от последнего полного месяца до события
    rest = event - shifted(total_months)

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
        "total_days": (target - now.date()).days,
    }
