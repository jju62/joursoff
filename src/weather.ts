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

function normalizeFrenchCitySearch(query: string) {
  const frenchSpellings: Record<string, string> = {
    etienne: 'Étienne',
  };

  return query
    .trim()
    .replace(/\s*-\s*/g, ' ')
    .split(/\s+/)
    .map((part, index) => {
      const normalized = part.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR');
      if (frenchSpellings[normalized]) return frenchSpellings[normalized];
      return index === 0 ? part : part.toLocaleLowerCase('fr-FR');
    })
    .join('-');
}

export async function searchCitySuggestions(
  query: string,
  signal?: AbortSignal
): Promise<WeatherLocation[]> {
  const queries = [...new Set([query.trim(), normalizeFrenchCitySearch(query)])];
  for (const cityQuery of queries) {
    const params = new URLSearchParams({
      name: cityQuery,
      count: '5',
      language: 'fr',
      format: 'json',
    });
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, { signal });
    if (!response.ok) throw new Error('Recherche de ville indisponible. Réessayez plus tard.');
    const result = await response.json() as {
      results?: {
        name: string;
        latitude: number;
        longitude: number;
        country?: string;
        admin1?: string;
      }[];
    };
    if (result.results?.length) {
      return result.results.map((place) => {
        const details = [place.admin1, place.country]
          .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
        return {
          name: [place.name, ...details].join(', '),
          latitude: place.latitude,
          longitude: place.longitude,
        };
      });
    }
  }
  return [];
}

export async function reverseGeocodeCoordinates(
  latitude: number,
  longitude: number,
  signal?: AbortSignal
): Promise<WeatherLocation> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    localityLanguage: 'fr',
  });
  const response = await fetch(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?${params}`,
    { signal }
  );
  if (!response.ok) throw new Error('Nom de ville indisponible pour cette position.');
  const result = await response.json() as {
    city?: string;
    locality?: string;
    principalSubdivision?: string;
    countryName?: string;
  };
  const locality = result.city || result.locality || result.principalSubdivision;
  if (!locality) throw new Error('Aucune ville proche n’a pu être identifiée pour cette position.');
  const details = [result.principalSubdivision, result.countryName]
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  return {
    name: [locality, ...details.filter((detail) => detail !== locality)].join(', '),
    latitude,
    longitude,
  };
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
  const match = (await searchCitySuggestions(city, signal))[0];
  if (!match) throw new Error(`Ville introuvable : ${city}.`);
  return match;
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
