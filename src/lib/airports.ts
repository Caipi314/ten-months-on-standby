import raw from '../data/airports.json';
import type { Airport } from './types';

type Row = [string, string, string, string, string, number, number, number];

export const AIRPORTS: Airport[] = (raw as Row[]).map(([iata, icao, name, city, country, lat, lon, size]) => ({
  iata, icao, name, city, country, lat, lon, size,
}));

const byIata = new Map(AIRPORTS.map((a) => [a.iata, a]));
const byIcao = new Map(AIRPORTS.filter((a) => a.icao).map((a) => [a.icao, a]));

export const airport = (code?: string | null): Airport | undefined =>
  code ? byIata.get(code.toUpperCase()) ?? byIcao.get(code.toUpperCase()) : undefined;

export function shortName(a: Airport): string {
  return a.name
    .replace(/International|Intl\.?|Airport|Aeropuerto|Aéroport|Flughafen|Aeroporto/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function searchAirports(q: string, limit = 30): Airport[] {
  const s = q.trim().toLowerCase();
  if (!s) return AIRPORTS.filter((a) => a.size === 3).slice(0, limit);
  const out: [number, Airport][] = [];
  for (const a of AIRPORTS) {
    let score = -1;
    const iata = a.iata.toLowerCase();
    if (iata === s) score = 100;
    else if (a.icao.toLowerCase() === s) score = 90;
    else if (a.city.toLowerCase().startsWith(s)) score = 60;
    else if (iata.startsWith(s)) score = 55;
    else if (a.name.toLowerCase().includes(s)) score = 40;
    else if (a.city.toLowerCase().includes(s)) score = 30;
    if (score >= 0) out.push([score + a.size * 3, a]);
  }
  return out.sort((x, y) => y[0] - x[0]).slice(0, limit).map((x) => x[1]);
}
