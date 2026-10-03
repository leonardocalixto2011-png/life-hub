/**
 * Daily forecast for a trip's destination, from Open-Meteo (free, no key).
 *
 * Server-side only, so the page's CSP never sees it. Best-effort by design: a
 * forecast is a nice-to-have on the trip page, so any failure (no network,
 * unknown place, trip outside the 16-day window) returns null and the page
 * renders exactly as before. Cached an hour per URL by Next's fetch cache.
 */
import { differenceInCalendarDays, format, startOfDay } from "date-fns";

export type DayWeather = {
  /** WMO weather code, see `weatherKind`. */
  code: number;
  max: number;
  min: number;
  /** Max precipitation probability for the day, 0–100, or null. */
  rain: number | null;
};

export type WeatherKind = "sun" | "partly" | "cloud" | "fog" | "rain" | "snow" | "storm";

/** Collapse WMO codes into the handful of pictures the page shows. */
export function weatherKind(code: number): WeatherKind {
  if (code <= 1) return "sun";
  if (code === 2) return "partly";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "rain";
}

/** Forecasts only reach this far ahead. */
const FORECAST_DAYS = 16;
const TIMEOUT_MS = 2500;

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, {
    signal,
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  return res.json();
}

type Place = { latitude: number; longitude: number; country_code?: string };

/**
 * "Orford, Cantons-de-l'Est" → Orford. Several towns share a name, so prefer
 * a Canadian match (this app's people live in Québec), then the most
 * populous, which is what the geocoder ranks first.
 */
async function geocode(destination: string, signal: AbortSignal): Promise<Place | null> {
  const name = destination.split(/[,(·–]/)[0].trim();
  if (name.length < 2) return null;
  const data = (await getJson(
    `https://geocoding-api.open-meteo.com/v1/search?count=10&format=json&name=${encodeURIComponent(name)}`,
    signal,
  )) as { results?: Place[] } | null;
  const list = data?.results ?? [];
  return list.find((p) => p.country_code === "CA") ?? list[0] ?? null;
}

/** Day key (yyyy-MM-dd) → forecast, for the days of the trip that have one. */
export async function tripWeather(
  destination: string | null,
  start: Date,
  end: Date,
): Promise<Map<string, DayWeather> | null> {
  if (!destination) return null;
  const today = startOfDay(new Date());
  // Nothing to show for a trip that's over or still beyond the forecast.
  if (startOfDay(end) < today) return null;
  if (differenceInCalendarDays(start, today) >= FORECAST_DAYS) return null;
  // One budget for both calls: the page waits on this, so a slow API must
  // cost at most this much before the trip renders without a forecast.
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const place = await geocode(destination, signal);
    if (!place) return null;
    const data = (await getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
        `&timezone=auto&forecast_days=${FORECAST_DAYS}`,
      signal,
    )) as {
      daily?: {
        time: string[];
        weather_code: number[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_probability_max?: (number | null)[];
      };
    } | null;
    const d = data?.daily;
    if (!d?.time) return null;
    const from = format(startOfDay(start), "yyyy-MM-dd");
    const to = format(startOfDay(end), "yyyy-MM-dd");
    const out = new Map<string, DayWeather>();
    d.time.forEach((day, n) => {
      if (day < from || day > to) return;
      out.set(day, {
        code: d.weather_code[n],
        max: Math.round(d.temperature_2m_max[n]),
        min: Math.round(d.temperature_2m_min[n]),
        rain: d.precipitation_probability_max?.[n] ?? null,
      });
    });
    return out.size > 0 ? out : null;
  } catch {
    return null;
  }
}
