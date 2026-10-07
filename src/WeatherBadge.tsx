interface WeatherBadgeProps {
  code: number;
  maximumTemperature: number;
}

function getWeatherDescription(code: number) {
  if (code === 0) return { icon: '☀️', label: 'Ensoleillé' };
  if (code >= 1 && code <= 3) return { icon: '⛅', label: code === 3 ? 'Nuageux' : 'Éclaircies' };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { icon: '🌧️', label: 'Pluie' };
  if (code >= 71 && code <= 77) return { icon: '❄️', label: 'Neige' };
  if (code >= 95 && code <= 99) return { icon: '⛈️', label: 'Orage' };
  return { icon: '☁️', label: 'Couvert' };
}

export function WeatherBadge({ code, maximumTemperature }: WeatherBadgeProps) {
  const weather = getWeatherDescription(code);

  return (
    <span
      role="img"
      aria-label={`${weather.label}, ${Math.round(maximumTemperature)} °C maximum`}
      className="pointer-events-none absolute left-0.5 top-0.5 rounded-full bg-white/80 px-0.5 text-[8px] leading-[10px] shadow-sm"
      title={`${weather.label} · ${Math.round(maximumTemperature)} °C`}
    >
      {weather.icon}
    </span>
  );
}
