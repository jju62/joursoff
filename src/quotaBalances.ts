export type QuotaSettings = {
  cp: number;
  rtt: number;
  rttMode: 'fixed' | 'monthly';
  rttMonthly: number;
  rttCurrentBalance: number;
  rttBalanceDate: string;
  rttMax: number | null;
  periodStart: string;
  periodEnd: string;
};

export type BalanceLeave = {
  type: 'CP' | 'RTT';
  date: string;
  days: number;
  recordedAt?: string;
};

function getQuotaPeriod(referenceDate: string, periodStart: string, periodEnd: string) {
  const referenceMonthDay = referenceDate.slice(5);
  let startYear = Number(referenceDate.slice(0, 4));
  if (referenceMonthDay < periodStart) startYear -= 1;
  const endYear = startYear + (periodEnd <= periodStart ? 1 : 0);
  return {
    start: `${startYear}-${periodStart}`,
    end: `${endYear}-${periodEnd}`,
  };
}

function toLocalIsoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function calculateLeaveBalances(
  leaves: BalanceLeave[],
  quotas: QuotaSettings,
  today: string
) {
  const period = getQuotaPeriod(today, quotas.periodStart, quotas.periodEnd);
  let cpUsed = 0;
  let rttUsed = 0;
  for (const leave of leaves) {
    if (leave.type === 'CP' && leave.date >= period.start && leave.date <= period.end) {
      cpUsed += Number(leave.days) || 0;
    }
  }

  let rttRemaining: number;
  if (quotas.rttMode === 'monthly') {
    const balanceDate = new Date(`${quotas.rttBalanceDate}T00:00:00`);
    const balanceTimestamp = balanceDate.getTime();
    const nowTimestamp = Date.now();
    const events: { timestamp: number; kind: 'accrual' | 'leave'; days: number }[] = [];
    let monthOffset = 1;
    while (Number.isFinite(balanceTimestamp)) {
      const accrualDate = new Date(balanceDate);
      const originalDay = balanceDate.getDate();
      accrualDate.setDate(1);
      accrualDate.setMonth(balanceDate.getMonth() + monthOffset);
      const lastDayOfMonth = new Date(
        accrualDate.getFullYear(),
        accrualDate.getMonth() + 1,
        0
      ).getDate();
      accrualDate.setDate(Math.min(originalDay, lastDayOfMonth));
      const timestamp = accrualDate.getTime();
      if (!Number.isFinite(timestamp) || timestamp > nowTimestamp) break;
      events.push({ timestamp, kind: 'accrual', days: quotas.rttMonthly });
      monthOffset += 1;
    }
    for (const leave of leaves) {
      if (leave.type !== 'RTT' || !leave.recordedAt || leave.date < today) continue;
      const timestamp = new Date(leave.recordedAt).getTime();
      if (timestamp >= balanceTimestamp && timestamp <= nowTimestamp) {
        events.push({ timestamp, kind: 'leave', days: Number(leave.days) || 0 });
      }
    }
    events.sort((left, right) =>
      left.timestamp - right.timestamp ||
      (left.kind === 'accrual' ? -1 : 1)
    );
    rttRemaining = Math.max(
      0,
      quotas.rttMax === null
        ? quotas.rttCurrentBalance
        : Math.min(quotas.rttCurrentBalance, quotas.rttMax)
    );
    for (const event of events) {
      if (event.kind === 'accrual') {
        rttRemaining += event.days;
        if (quotas.rttMax !== null) rttRemaining = Math.min(rttRemaining, quotas.rttMax);
      } else {
        rttRemaining -= event.days;
        rttUsed += event.days;
      }
    }
  } else {
    for (const leave of leaves) {
      if (leave.type === 'RTT' && leave.date >= period.start && leave.date <= period.end) {
        rttUsed += Number(leave.days) || 0;
      }
    }
    rttRemaining = quotas.rtt - rttUsed;
  }

  return {
    cpUsed,
    rttUsed,
    cpRemaining: quotas.cp - cpUsed,
    rttRemaining,
    rttAllowance: quotas.rttMode === 'monthly' && quotas.rttMax !== null
      ? quotas.rttMax
      : quotas.rttMode === 'monthly'
        ? Math.max(quotas.rttCurrentBalance, rttRemaining)
        : quotas.rtt,
  };
}

export function getLocalToday() {
  return toLocalIsoDate(new Date());
}
