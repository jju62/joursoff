import { useEffect, useState } from 'react';

export interface DailyForecast {
  date: string;
  code: number;
  maximumTemperature: number;
}

interface WeatherState {
  forecasts: Record<string, DailyForecast>;
  error: string | null;
}

const DEFAULT_LOCATION = {
  latitude: 48.8566,
  longitude: 2.3522,
};

async function fetchForecast(
  latitude: number,
  longitude: number,
  forecastDays: number,
  signal: AbortSignal
): Promise<DailyForecast[]> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: 'weather_code,temperature_2m_max',
    forecast_days: String(forecastDays),
    timezone: 'auto',
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal });
  if (!response.ok) throw new Error('Prévisions météo indisponibles.');

  const result = await response.json() as {
    daily?: {
      time?: string[];
      weather_code?: number[];
      temperature_2m_max?: number[];
    };
  };
  const { time, weather_code: codes, temperature_2m_max: temperatures } = result.daily ?? {};
  if (!time?.length || !codes || !temperatures || codes.length !== time.length || temperatures.length !== time.length) {
    throw new Error('Les prévisions météo reçues sont incomplètes.');
  }

  return time.map((date, index) => {
    const code = codes[index];
    const maximumTemperature = temperatures[index];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(code) || !Number.isFinite(maximumTemperature)) {
      throw new Error('Les prévisions météo reçues sont invalides.');
    }
    return { date, code, maximumTemperature };
  });
}

export function useWeather(forecastDays: number): WeatherState {
  const [state, setState] = useState<WeatherState>({ forecasts: {}, error: null });

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setState({ forecasts: {}, error: null });

    const loadForecast = async (latitude: number, longitude: number) => {
      try {
        const dailyForecasts = await fetchForecast(latitude, longitude, forecastDays, controller.signal);
        if (cancelled) return;
        setState({
          forecasts: Object.fromEntries(dailyForecasts.map((forecast) => [forecast.date, forecast])),
          error: null,
        });
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        setState({
          forecasts: {},
          error: error instanceof Error ? error.message : 'Impossible de charger la météo.',
        });
      }
    };

    const loadDefaultForecast = () => {
      void loadForecast(DEFAULT_LOCATION.latitude, DEFAULT_LOCATION.longitude);
    };

    if (!navigator.geolocation) {
      loadDefaultForecast();
    } else {
      try {
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => void loadForecast(coords.latitude, coords.longitude),
          loadDefaultForecast,
          { maximumAge: 15 * 60 * 1000, timeout: 10_000 }
        );
      } catch {
        loadDefaultForecast();
      }
    }

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [forecastDays]);

  return state;
}
