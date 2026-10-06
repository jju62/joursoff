function toLocalIsoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function forecastMonthlyRttBalance(
  currentBalance: number,
  monthlyAccrual: number,
  maximumBalance: number | null,
  accrualAnchor: string,
  today: string,
  throughDate: string,
  alreadyReserved: { date: string; days: number }[]
) {
  if (throughDate <= today) return currentBalance;

  const anchor = new Date(`${accrualAnchor}T12:00:00`);
  if (!Number.isFinite(anchor.getTime())) {
    throw new RangeError('La date de référence RTT est invalide.');
  }

  const events: { date: string; kind: 'accrual' | 'leave'; days: number }[] = [];
  let projectedBalance = currentBalance + alreadyReserved.reduce((total, leave) => total + leave.days, 0);
  if (maximumBalance !== null) projectedBalance = Math.min(projectedBalance, maximumBalance);
  let monthOffset = 1;
  while (true) {
    const accrualDate = new Date(anchor);
    const anchorDay = anchor.getDate();
    accrualDate.setDate(1);
    accrualDate.setMonth(anchor.getMonth() + monthOffset);
    const lastDayOfMonth = new Date(
      accrualDate.getFullYear(),
      accrualDate.getMonth() + 1,
      0
    ).getDate();
    accrualDate.setDate(Math.min(anchorDay, lastDayOfMonth));

    const date = toLocalIsoDate(accrualDate);
    if (date > throughDate) break;
    if (date > today) {
      events.push({ date, kind: 'accrual', days: monthlyAccrual });
    }
    monthOffset += 1;
  }

  for (const leave of alreadyReserved) {
    if (leave.date >= today && leave.date <= throughDate) {
      events.push({ ...leave, kind: 'leave' });
    }
  }
  events.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    if (a.kind === b.kind) return 0;
    return a.kind === 'accrual' ? -1 : 1;
  });
  for (const event of events) {
    if (event.kind === 'accrual') {
      projectedBalance += event.days;
      if (maximumBalance !== null) projectedBalance = Math.min(projectedBalance, maximumBalance);
    } else {
      projectedBalance -= event.days;
    }
  }

  return projectedBalance;
}
