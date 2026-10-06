import { getFrenchHolidays } from './holidays2026';

function toLocalIsoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function getBookableLeaveDates(start: string, end: string, existingDates: string[]) {
  const dates: string[] = [];
  let weekdays = 0;
  let holidaysSkipped = 0;
  let existingSkipped = 0;
  const alreadyBooked = new Set(existingDates);
  const holidayDatesByYear = new Map<number, Set<string>>();
  const cursor = new Date(`${start}T12:00:00`);
  const lastDate = new Date(`${end}T12:00:00`);

  while (cursor <= lastDate) {
    const date = toLocalIsoDate(cursor);
    const weekday = cursor.getDay();
    if (weekday !== 0 && weekday !== 6) {
      weekdays += 1;
      const year = cursor.getFullYear();
      let holidays = holidayDatesByYear.get(year);
      if (!holidays) {
        holidays = new Set(getFrenchHolidays(year).map((holiday) => holiday.date));
        holidayDatesByYear.set(year, holidays);
      }

      if (holidays.has(date)) {
        holidaysSkipped += 1;
      } else if (alreadyBooked.has(date)) {
        existingSkipped += 1;
      } else {
        dates.push(date);
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    dates,
    weekdays,
    holidaysSkipped,
    existingSkipped,
    weekendsSkipped: Math.round(
      (lastDate.getTime() - new Date(`${start}T12:00:00`).getTime()) / 86400000
    ) + 1 - weekdays,
  };
}
