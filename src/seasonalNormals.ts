import type { Destination } from './data/destinations';

export type SeasonalNormals = {
  averageMinimum: number;
  averageMaximum: number;
  averageSunshineHours: number;
};

const normalsCache = new Map<string, Promise<SeasonalNormals>>();

export function fetchSeasonalNormals(destination: Destination, month: number): Promise<SeasonalNormals> {
  const key = `${destination.latitude},${destination.longitude}:${month}`;
  const cached = normalsCache.get(key);
  if (cached) return cached;

  const request = (async () => {
    const params = new URLSearchParams({
      latitude: String(destination.latitude),
      longitude: String(destination.longitude),
      start_date: '1991-01-01',
      end_date: '2020-12-31',
      daily: 'temperature_2m_min,temperature_2m_max,sunshine_duration',
      timezone: 'auto',
    });
    const response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`);
    if (!response.ok) {
      throw new Error(`Normales de saison indisponibles pour ${destination.name}.`);
    }

    const result = await response.json() as {
      daily?: {
        time?: string[];
        temperature_2m_min?: (number | null)[];
        temperature_2m_max?: (number | null)[];
        sunshine_duration?: (number | null)[];
      };
    };
    const daily = result.daily;
    if (
      !daily?.time ||
      !daily.temperature_2m_min ||
      !daily.temperature_2m_max ||
      !daily.sunshine_duration
    ) {
      throw new Error(`Les normales de saison reçues pour ${destination.name} sont incomplètes.`);
    }

    let minimumTotal = 0;
    let maximumTotal = 0;
    let sunshineTotal = 0;
    let count = 0;
    const targetMonth = String(month).padStart(2, '0');
    daily.time.forEach((date, index) => {
      if (date.slice(5, 7) !== targetMonth) return;
      const minimum = daily.temperature_2m_min?.[index];
      const maximum = daily.temperature_2m_max?.[index];
      const sunshine = daily.sunshine_duration?.[index];
      if (
        typeof minimum !== 'number' ||
        typeof maximum !== 'number' ||
        typeof sunshine !== 'number' ||
        !Number.isFinite(minimum) ||
        !Number.isFinite(maximum) ||
        !Number.isFinite(sunshine)
      ) return;
      minimumTotal += minimum;
      maximumTotal += maximum;
      sunshineTotal += sunshine;
      count += 1;
    });

    if (count === 0) {
      throw new Error(`Aucune normale de saison exploitable pour ${destination.name}.`);
    }
    return {
      averageMinimum: minimumTotal / count,
      averageMaximum: maximumTotal / count,
      averageSunshineHours: sunshineTotal / count / 3600,
    };
  })();

  normalsCache.set(key, request);
  void request.catch(() => normalsCache.delete(key));
  return request;
}
