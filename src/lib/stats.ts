import countries from 'i18n-iso-countries';
import en from 'i18n-iso-countries/langs/en.json';
import { airport } from './airports';
import { estimateMinutes } from './geo';
import type { Flight } from './types';

countries.registerLocale(en);
export const countryName = (a2: string) => countries.getName(a2, 'en', { select: 'alias' }) ?? a2;
export const alpha2ToNumeric = (a2: string) => countries.alpha2ToNumeric(a2) ?? '';
export const numericToAlpha2 = (n: string) => countries.numericToAlpha2(n) ?? '';
export const flagEmoji = (a2: string) =>
  a2.length === 2 ? String.fromCodePoint(...[...a2.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '';

/** Flights that actually happened (cleared or confirmed, not in the future). */
export const flown = (fs: Flight[]) => fs.filter((f) => f.outcome !== 'bumped');
export const minutesOf = (f: Flight) => f.durationMin ?? estimateMinutes(f.distanceKm);

export interface Counted { key: string; count: number }
const tally = (keys: string[]): Counted[] => {
  const m = new Map<string, number>();
  for (const k of keys) if (k) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
};

export interface Stats {
  flights: number;
  attempts: number;
  bumped: number;
  clearRate: number | null; // cleared / (cleared + bumped)
  km: number;
  minutes: number;
  airports: Counted[];
  airlines: Counted[];
  aircraft: Counted[];
  routes: Counted[]; // "YYZ–YVR" undirected
  countries: Counted[]; // alpha-2
  longest: Flight | null;
  shortest: Flight | null;
  byYear: { year: string; flights: number; km: number }[];
}

export function computeStats(all: Flight[]): Stats {
  const fs = flown(all);
  const cleared = all.filter((f) => f.outcome === 'cleared').length;
  const bumped = all.filter((f) => f.outcome === 'bumped').length;
  const years = new Map<string, { flights: number; km: number }>();
  for (const f of fs) {
    const y = f.date.slice(0, 4);
    const e = years.get(y) ?? { flights: 0, km: 0 };
    e.flights++; e.km += f.distanceKm; years.set(y, e);
  }
  const sorted = [...fs].sort((a, b) => b.distanceKm - a.distanceKm);
  return {
    flights: fs.length,
    attempts: all.length,
    bumped,
    clearRate: cleared + bumped ? cleared / (cleared + bumped) : null,
    km: fs.reduce((s, f) => s + f.distanceKm, 0),
    minutes: fs.reduce((s, f) => s + minutesOf(f), 0),
    airports: tally(fs.flatMap((f) => [f.from, f.to])),
    airlines: tally(fs.map((f) => f.airline || f.flightNumber.slice(0, 2))),
    aircraft: tally(fs.map((f) => f.aircraft ?? '')),
    routes: tally(fs.map((f) => [f.from, f.to].sort().join('–'))),
    countries: tally(fs.flatMap((f) => [airport(f.from)?.country ?? '', airport(f.to)?.country ?? ''])),
    longest: sorted[0] ?? null,
    shortest: sorted[sorted.length - 1] ?? null,
    byYear: [...years].map(([year, v]) => ({ year, ...v })).sort((a, b) => b.year.localeCompare(a.year)),
  };
}

export interface ClearRow { key: string; cleared: number; bumped: number; rate: number }
/** Standby clear-rate grouped by an arbitrary key (route, airline, departure hour bucket…). */
export function clearRateBy(all: Flight[], keyFn: (f: Flight) => string): ClearRow[] {
  const m = new Map<string, { cleared: number; bumped: number }>();
  for (const f of all) {
    if (f.outcome === 'confirmed') continue;
    const k = keyFn(f);
    const e = m.get(k) ?? { cleared: 0, bumped: 0 };
    if (f.outcome === 'cleared') e.cleared++; else e.bumped++;
    m.set(k, e);
  }
  return [...m]
    .map(([key, v]) => ({ key, ...v, rate: v.cleared / (v.cleared + v.bumped) }))
    .sort((a, b) => b.cleared + b.bumped - (a.cleared + a.bumped));
}

export const hourBucket = (f: Flight) => {
  const h = Number(f.depSched?.match(/T(\d{2})/)?.[1] ?? NaN);
  if (Number.isNaN(h)) return 'Unknown';
  return h < 6 ? 'Red-eye (0–6)' : h < 12 ? 'Morning (6–12)' : h < 18 ? 'Afternoon (12–18)' : 'Evening (18–24)';
};
