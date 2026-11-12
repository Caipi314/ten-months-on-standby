import { flown } from './stats';
import type { Flight } from './types';

/** "fin 301", "#0301", " 301 " → "301". Keeps letters for carriers that use them. */
export const normalizeFin = (s?: string | null) => (s ?? '').toUpperCase().replace(/^\s*(FIN)?\s*#?\s*/, '').replace(/\s+/g, '').replace(/^0+(?=\d)/, '');
export const normalizeReg = (s?: string | null) => (s ?? '').toUpperCase().trim();

/** One physical aircraft you've flown on, identified by FIN where known, otherwise by registration. */
export interface Airframe {
  key: string;
  fin: string | null;
  reg: string | null;
  type: string | null; // most common aircraft type logged for it
  airline: string;
  flights: Flight[]; // newest first
  first: string; // YYYY-MM-DD
  last: string;
  km: number;
}

/** FIN ↔ registration pairs learned from your own flights, so entering one can fill in the other. */
export function finIndex(all: Flight[]) {
  const finByReg = new Map<string, string>();
  const regByFin = new Map<string, string>();
  // Newest first, so the most recent pairing wins if an airframe was ever re-registered.
  for (const f of all) {
    const fin = normalizeFin(f.fin), reg = normalizeReg(f.registration);
    if (fin && reg) {
      if (!finByReg.has(reg)) finByReg.set(reg, fin);
      if (!regByFin.has(fin)) regByFin.set(fin, reg);
    }
  }
  return { finByReg, regByFin };
}

export const airframeKey = (fin: string | null, reg: string | null) => (fin ? `FIN:${fin}` : reg ? `REG:${reg}` : '');

/** Group flown flights (not bumps or planned) by airframe. Most-flown first. */
export function airframes(all: Flight[]): Airframe[] {
  const { finByReg, regByFin } = finIndex(all);
  const m = new Map<string, Airframe & { types: Map<string, number> }>();
  for (const f of flown(all).filter((f) => !f.planned)) {
    const reg0 = normalizeReg(f.registration);
    const fin = normalizeFin(f.fin) || finByReg.get(reg0) || null;
    const reg = reg0 || (fin ? regByFin.get(fin) ?? null : null);
    const key = airframeKey(fin, reg);
    if (!key) continue;
    let a = m.get(key);
    if (!a) { a = { key, fin, reg, type: null, airline: f.airline, flights: [], first: f.date, last: f.date, km: 0, types: new Map() }; m.set(key, a); }
    a.flights.push(f);
    a.km += f.distanceKm;
    if (f.date < a.first) a.first = f.date;
    if (f.date > a.last) { a.last = f.date; a.airline = f.airline || a.airline; }
    if (!a.reg && reg) a.reg = reg;
    if (f.aircraft) a.types.set(f.aircraft, (a.types.get(f.aircraft) ?? 0) + 1);
  }
  return [...m.values()]
    .map(({ types, ...a }) => ({
      ...a,
      type: [...types].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null,
      flights: a.flights.sort((x, y) => (y.date + (y.depSched ?? '')).localeCompare(x.date + (x.depSched ?? ''))),
    }))
    .sort((a, b) => b.flights.length - a.flights.length || b.last.localeCompare(a.last));
}

/** Flown flights with neither a FIN nor a registration, so they can't be tied to an airframe yet. */
export const missingAirframe = (all: Flight[]) => flown(all).filter((f) => !f.planned && !normalizeFin(f.fin) && !normalizeReg(f.registration));

export const airframeLabel = (a: Pick<Airframe, 'fin' | 'reg'>) => (a.fin ? `FIN ${a.fin}` : a.reg ?? '');
