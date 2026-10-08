export interface WeatherLocation {
  name: string;
  latitude: number;
  longitude: number;
}

export interface DailyWeather {
  date: string;
  code: number;
  maximumTemperature: number;
  precipitationProbability: number;
}

export function weatherDescription(code: number) {
  if (code === 0) return { label: 'Ensoleillé', icon: '☀️' };
  if (code <= 2) return { label: 'Éclaircies', icon: '🌤️' };
  if (code === 3) return { label: 'Nuageux', icon: '☁️' };
  if (code <= 48) return { label: 'Brouillard', icon: '🌫️' };
  if (code <= 67 || (code >= 80 && code <= 82)) return { label: 'Pluie', icon: '🌧️' };
  if (code <= 77) return { label: 'Neige', icon: '❄️' };
  if (code <= 86) return { label: 'Averses de neige', icon: '🌨️' };
  return { label: 'Orage', icon: '⛈️' };
}

export async function geocodeCity(city: string, signal?: AbortSignal): Promise<WeatherLocation> {
  const params = new URLSearchParams({
    name: city,
    count: '1',
    language: 'fr',
    format: 'json',
  });
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, { signal });
  if (!response.ok) throw new Error('Recherche de ville indisponible. Réessayez plus tard.');
  const result = await response.json() as {
    results?: { name: string; latitude: number; longitude: number; country?: string }[];
  };
  const match = result.results?.[0];
  if (!match) throw new Error(`Ville introuvable : ${city}.`);
  return {
    name: match.country ? `${match.name}, ${match.country}` : match.name,
    latitude: match.latitude,
    longitude: match.longitude,
  };
}

export async function fetchDailyWeather(
  location: WeatherLocation,
  signal: AbortSignal | undefined,
  forecastDays: number
): Promise<DailyWeather[]> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    daily: 'weather_code,temperature_2m_max,precipitation_probability_max',
    forecast_days: String(forecastDays),
    timezone: 'auto',
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal });
  if (!response.ok) throw new Error(`Prévisions indisponibles pour ${location.name}.`);
  const result = await response.json() as {
    daily?: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      precipitation_probability_max: number[];
    };
  };
  const daily = result.daily;
  if (
    !daily?.time ||
    !daily.weather_code ||
    !daily.temperature_2m_max ||
    !daily.precipitation_probability_max ||
    daily.time.length !== daily.weather_code.length ||
    daily.time.length !== daily.temperature_2m_max.length ||
    daily.time.length !== daily.precipitation_probability_max.length
  ) {
    throw new Error(`Prévisions incomplètes pour ${location.name}.`);
  }
  return daily.time.map((date, index) => ({
    date,
    code: daily.weather_code[index],
    maximumTemperature: daily.temperature_2m_max[index],
    precipitationProbability: daily.precipitation_probability_max[index],
  }));
}
