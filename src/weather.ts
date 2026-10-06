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

export const SUGGESTED_DESTINATIONS: (WeatherLocation & {
  activities: { dry: string; rainy: string };
})[] = [
  {
    name: 'Bordeaux',
    latitude: 44.8378,
    longitude: -0.5792,
    activities: {
      dry: 'Balade sur les quais, vélo dans les vignes et visite de Saint-Émilion.',
      rainy: 'Cité du Vin, Bassins des Lumières et dégustation à l’abri.',
    },
  },
  {
    name: 'Lyon',
    latitude: 45.764,
    longitude: 4.8357,
    activities: {
      dry: 'Vieux Lyon, traboules, Fourvière et pique-nique au parc de la Tête d’Or.',
      rainy: 'Musée des Confluences, Halles Paul Bocuse et pause gourmande.',
    },
  },
  {
    name: 'Marseille',
    latitude: 43.2965,
    longitude: 5.3698,
    activities: {
      dry: 'Vieux-Port, balade en bord de mer et calanques si les conditions le permettent.',
      rainy: 'MUCEM, quartier du Panier et découverte des spécialités locales.',
    },
  },
  {
    name: 'Strasbourg',
    latitude: 48.5734,
    longitude: 7.7521,
    activities: {
      dry: 'Petite France à pied, vélo le long de l’Ill et excursion en Alsace.',
      rainy: 'Cathédrale, musées du centre et winstub.',
    },
  },
];

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
  signal?: AbortSignal
): Promise<DailyWeather[]> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    daily: 'weather_code,temperature_2m_max,precipitation_probability_max',
    forecast_days: '16',
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
  if (!result.daily) throw new Error(`Prévisions incomplètes pour ${location.name}.`);
  return result.daily.time.map((date, index) => ({
    date,
    code: result.daily!.weather_code[index],
    maximumTemperature: result.daily!.temperature_2m_max[index],
    precipitationProbability: result.daily!.precipitation_probability_max[index],
  }));
}
