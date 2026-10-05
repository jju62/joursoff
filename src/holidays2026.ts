export interface FrenchHoliday {
  date: string; // YYYY-MM-DD
  name: string;
}

export interface BridgeOpportunity {
  id: string;
  holidayName: string;
  holidayDate: string;
  holidayDayLabel: string;
  bridgeDates: string[]; // YYYY-MM-DD array of days to pose
  bridgeLabel: string; // e.g., "Vendredi 2 janv."
  restSpanLabel: string; // e.g., "Du jeu. 1 au dim. 4 janv."
  costDays: number; // e.g., 1 or 2
  totalOffDays: number; // e.g., 4 or 5
  kind: 'pont_royal' | 'viaduc' | 'weekend_prolonge';
  timeline: {
    label: string;
    date: string;
    status: 'ferie' | 'pont' | 'weekend';
  }[];
}

export const FRENCH_HOLIDAYS_2026: FrenchHoliday[] = [
  { date: '2026-01-01', name: "Jour de l'An" },
  { date: '2026-04-06', name: 'Lundi de Pâques' },
  { date: '2026-05-01', name: 'Fête du Travail' },
  { date: '2026-05-08', name: 'Victoire 1945' },
  { date: '2026-05-14', name: 'Ascension' },
  { date: '2026-05-25', name: 'Lundi de Pentecôte' },
  { date: '2026-07-14', name: 'Fête Nationale' },
  { date: '2026-08-15', name: 'Assomption' },
  { date: '2026-11-01', name: 'Toussaint' },
  { date: '2026-11-11', name: 'Armistice 1918' },
  { date: '2026-12-25', name: 'Noël' },
];

const DAY_NAMES_FULL = [
  'Dimanche',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
];

const DAY_NAMES_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(iso: string, offset: number): string {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + offset);
  return toIsoDate(d);
}

export function formatShortDateFr(iso: string): string {
  const d = parseLocalDate(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function formatDayAndDateFr(iso: string): string {
  const d = parseLocalDate(iso);
  const dayName = DAY_NAMES_FULL[d.getDay()];
  const datePart = d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
  });
  return `${dayName} ${datePart}`;
}

/**
 * Calcule le dimanche de Pâques pour une année donnée (algorithme de Butcher/Oudin).
 */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 1=Jan
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Retourne les 11 jours fériés français pour n'importe quelle année.
 */
export function getFrenchHolidays(year: number): FrenchHoliday[] {
  const easter = easterSunday(year);
  const fmt = (d: Date) => toIsoDate(d);
  const offset = (base: Date, days: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    return d;
  };

  return [
    { date: `${year}-01-01`, name: "Jour de l'An" },
    { date: fmt(offset(easter, 1)), name: 'Lundi de Pâques' },
    { date: `${year}-05-01`, name: 'Fête du Travail' },
    { date: `${year}-05-08`, name: 'Victoire 1945' },
    { date: fmt(offset(easter, 39)), name: 'Ascension' },
    { date: fmt(offset(easter, 50)), name: 'Lundi de Pentecôte' },
    { date: `${year}-07-14`, name: 'Fête Nationale' },
    { date: `${year}-08-15`, name: 'Assomption' },
    { date: `${year}-11-01`, name: 'Toussaint' },
    { date: `${year}-11-11`, name: 'Armistice 1918' },
    { date: `${year}-12-25`, name: 'Noël' },
  ].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Analyse automatiquement les jours fériés d'une année donnée
 * pour extraire les opportunités de ponts (Mardi, Jeudi, Mercredi).
 * Par défaut utilise la liste 2026 pour la rétrocompatibilité.
 */
export function analyzeBridges2026(
  holidays: FrenchHoliday[] = FRENCH_HOLIDAYS_2026
): BridgeOpportunity[] {
  const opportunities: BridgeOpportunity[] = [];

  for (const h of holidays) {
    const dt = parseLocalDate(h.date);
    const dow = dt.getDay(); // 0=Dim, 1=Lun, 2=Mar, 3=Mer, 4=Jeu, 5=Ven, 6=Sam
    const holidayDayLabel = `${DAY_NAMES_FULL[dow]} ${dt.toLocaleDateString(
      'fr-FR',
      { day: 'numeric', month: 'short' }
    )}`;

    // Cas 1 : Jour férié un JEUDI -> Pont le VENDREDI (1 jour posé = 4 jours de repos)
    if (dow === 4) {
      const fri = addDays(h.date, 1);
      const sat = addDays(h.date, 2);
      const sun = addDays(h.date, 3);
      opportunities.push({
        id: `pont-${h.date}`,
        holidayName: h.name,
        holidayDate: h.date,
        holidayDayLabel,
        bridgeDates: [fri],
        bridgeLabel: `Vendredi ${formatShortDateFr(fri)}`,
        restSpanLabel: `Du jeu. ${formatShortDateFr(h.date)} au dim. ${formatShortDateFr(sun)}`,
        costDays: 1,
        totalOffDays: 4,
        kind: 'pont_royal',
        timeline: [
          { label: `Jeu ${parseLocalDate(h.date).getDate()}`, date: h.date, status: 'ferie' },
          { label: `Ven ${parseLocalDate(fri).getDate()}`, date: fri, status: 'pont' },
          { label: `Sam ${parseLocalDate(sat).getDate()}`, date: sat, status: 'weekend' },
          { label: `Dim ${parseLocalDate(sun).getDate()}`, date: sun, status: 'weekend' },
        ],
      });
    }

    // Cas 2 : Jour férié un MARDI -> Pont le LUNDI (1 jour posé = 4 jours de repos)
    if (dow === 2) {
      const sat = addDays(h.date, -3);
      const sun = addDays(h.date, -2);
      const mon = addDays(h.date, -1);
      opportunities.push({
        id: `pont-${h.date}`,
        holidayName: h.name,
        holidayDate: h.date,
        holidayDayLabel,
        bridgeDates: [mon],
        bridgeLabel: `Lundi ${formatShortDateFr(mon)}`,
        restSpanLabel: `Du sam. ${formatShortDateFr(sat)} au mar. ${formatShortDateFr(h.date)}`,
        costDays: 1,
        totalOffDays: 4,
        kind: 'pont_royal',
        timeline: [
          { label: `Sam ${parseLocalDate(sat).getDate()}`, date: sat, status: 'weekend' },
          { label: `Dim ${parseLocalDate(sun).getDate()}`, date: sun, status: 'weekend' },
          { label: `Lun ${parseLocalDate(mon).getDate()}`, date: mon, status: 'pont' },
          { label: `Mar ${parseLocalDate(h.date).getDate()}`, date: h.date, status: 'ferie' },
        ],
      });
    }

    // Cas 3 : Jour férié un MERCREDI -> Viaduc Jeudi + Vendredi (2 jours posés = 5 jours de repos)
    if (dow === 3) {
      const thu = addDays(h.date, 1);
      const fri = addDays(h.date, 2);
      const sat = addDays(h.date, 3);
      const sun = addDays(h.date, 4);
      opportunities.push({
        id: `viaduc-${h.date}`,
        holidayName: h.name,
        holidayDate: h.date,
        holidayDayLabel,
        bridgeDates: [thu, fri],
        bridgeLabel: `Jeu. ${parseLocalDate(thu).getDate()} & Ven. ${formatShortDateFr(fri)}`,
        restSpanLabel: `Du mer. ${formatShortDateFr(h.date)} au dim. ${formatShortDateFr(sun)}`,
        costDays: 2,
        totalOffDays: 5,
        kind: 'viaduc',
        timeline: [
          { label: `Mer ${parseLocalDate(h.date).getDate()}`, date: h.date, status: 'ferie' },
          { label: `Jeu ${parseLocalDate(thu).getDate()}`, date: thu, status: 'pont' },
          { label: `Ven ${parseLocalDate(fri).getDate()}`, date: fri, status: 'pont' },
          { label: `Sam ${parseLocalDate(sat).getDate()}`, date: sat, status: 'weekend' },
          { label: `Dim ${parseLocalDate(sun).getDate()}`, date: sun, status: 'weekend' },
        ],
      });
    }

    // Cas 4 : Jour férié un VENDREDI -> Extension en 4 jours (1 jour posé = 4 jours de repos)
    if (dow === 5) {
      const thu = addDays(h.date, -1);
      const sat = addDays(h.date, 1);
      const sun = addDays(h.date, 2);
      opportunities.push({
        id: `ext-${h.date}`,
        holidayName: h.name,
        holidayDate: h.date,
        holidayDayLabel,
        bridgeDates: [thu],
        bridgeLabel: `Jeudi ${formatShortDateFr(thu)}`,
        restSpanLabel: `Du jeu. ${formatShortDateFr(thu)} au dim. ${formatShortDateFr(sun)}`,
        costDays: 1,
        totalOffDays: 4,
        kind: 'weekend_prolonge',
        timeline: [
          { label: `Jeu ${parseLocalDate(thu).getDate()}`, date: thu, status: 'pont' },
          { label: `Ven ${parseLocalDate(h.date).getDate()}`, date: h.date, status: 'ferie' },
          { label: `Sam ${parseLocalDate(sat).getDate()}`, date: sat, status: 'weekend' },
          { label: `Dim ${parseLocalDate(sun).getDate()}`, date: sun, status: 'weekend' },
        ],
      });
    }

    // Cas 5 : Jour férié un LUNDI -> Extension mardi (1 jour posé = 4 jours de repos)
    if (dow === 1) {
      const sat = addDays(h.date, -2);
      const sun = addDays(h.date, -1);
      const tue = addDays(h.date, 1);
      opportunities.push({
        id: `ext-${h.date}`,
        holidayName: h.name,
        holidayDate: h.date,
        holidayDayLabel,
        bridgeDates: [tue],
        bridgeLabel: `Mardi ${formatShortDateFr(tue)}`,
        restSpanLabel: `Du sam. ${formatShortDateFr(sat)} au mar. ${formatShortDateFr(tue)}`,
        costDays: 1,
        totalOffDays: 4,
        kind: 'weekend_prolonge',
        timeline: [
          { label: `Sam ${parseLocalDate(sat).getDate()}`, date: sat, status: 'weekend' },
          { label: `Dim ${parseLocalDate(sun).getDate()}`, date: sun, status: 'weekend' },
          { label: `Lun ${parseLocalDate(h.date).getDate()}`, date: h.date, status: 'ferie' },
          { label: `Mar ${parseLocalDate(tue).getDate()}`, date: tue, status: 'pont' },
        ],
      });
    }
  }

  return opportunities;
}

export function getHolidayCalendarSummary(holidays: FrenchHoliday[] = FRENCH_HOLIDAYS_2026) {
  return holidays.map((h) => {
    const dt = parseLocalDate(h.date);
    const dow = dt.getDay();
    let status: 'pont_mardi_jeudi' | 'viaduc_mercredi' | 'weekend_3j' | 'weekend_perdu' = 'weekend_3j';
    let note = 'Week-end de 3 jours';

    if (dow === 2) {
      status = 'pont_mardi_jeudi';
      note = 'Pont du lundi (4j pour 1j posé)';
    } else if (dow === 4) {
      status = 'pont_mardi_jeudi';
      note = 'Pont du vendredi (4j pour 1j posé)';
    } else if (dow === 3) {
      status = 'viaduc_mercredi';
      note = 'Viaduc jeu-ven (5j pour 2j posés)';
    } else if (dow === 0 || dow === 6) {
      status = 'weekend_perdu';
      note = 'Tombe le week-end';
    }

    return {
      ...h,
      dayShort: DAY_NAMES_SHORT[dow],
      dayFull: DAY_NAMES_FULL[dow],
      formattedDate: formatShortDateFr(h.date),
      status,
      note,
    };
  });
}

/** @deprecated Use getHolidayCalendarSummary instead */
export function getHolidayCalendarSummary2026() {
  return getHolidayCalendarSummary(FRENCH_HOLIDAYS_2026);
}
