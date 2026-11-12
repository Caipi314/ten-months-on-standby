import { useSyncExternalStore } from 'react';
import type { Flight, Trip } from './types';
import type { Units } from './format';

export interface Settings {
  units: Units;
  homeAirport: string;
  rapidApiKey: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export interface SyncState {
  status: 'off' | 'signed-out' | 'idle' | 'syncing' | 'error';
  email?: string | null;
  message?: string | null;
  lastSync?: string | null;
}

interface State {
  flights: Record<string, Flight>;
  trips: Record<string, Trip>;
  dirty: { flights: string[]; trips: string[] };
  lastPull: string | null;
  settings: Settings;
  sync: SyncState;
}

const KEY = 'passport.v1';
const defaults: State = {
  flights: {},
  trips: {},
  dirty: { flights: [], trips: [] },
  lastPull: null,
  settings: { units: 'km', homeAirport: 'YYZ', rapidApiKey: '', supabaseUrl: '', supabaseAnonKey: '' },
  sync: { status: 'off' },
};

function load(): State {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) return { ...defaults, ...s, settings: { ...defaults.settings, ...s.settings }, sync: { status: 'off' } };
  } catch { /* ignore corrupted storage */ }
  return defaults;
}

let state: State = load();
const listeners = new Set<() => void>();
const changeHooks = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, sync: undefined }));
  } catch { /* storage full or unavailable */ }
}

export function setState(fn: (s: State) => State, opts: { local?: boolean } = {}) {
  state = fn(state);
  persist();
  listeners.forEach((l) => l());
  if (opts.local) changeHooks.forEach((h) => h());
}

export const getState = () => state;
export const onLocalChange = (fn: () => void) => { changeHooks.add(fn); return () => changeHooks.delete(fn); };

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state));
}

const now = () => new Date().toISOString();
const addDirty = (list: string[], id: string) => (list.includes(id) ? list : [...list, id]);

export function saveFlight(f: Flight) {
  const flight = { ...f, updatedAt: now() };
  setState((s) => ({ ...s, flights: { ...s.flights, [f.id]: flight }, dirty: { ...s.dirty, flights: addDirty(s.dirty.flights, f.id) } }), { local: true });
}

export function deleteFlight(id: string) {
  const f = state.flights[id];
  if (f) saveFlight({ ...f, deleted: true });
}

export function saveTrip(t: Trip) {
  const trip = { ...t, updatedAt: now() };
  setState((s) => ({ ...s, trips: { ...s.trips, [t.id]: trip }, dirty: { ...s.dirty, trips: addDirty(s.dirty.trips, t.id) } }), { local: true });
}

export function deleteTrip(id: string) {
  const t = state.trips[id];
  if (!t) return;
  for (const f of Object.values(state.flights)) if (f.tripId === id && !f.deleted) saveFlight({ ...f, tripId: null });
  saveTrip({ ...t, deleted: true });
}

export function updateSettings(p: Partial<Settings>) {
  setState((s) => ({ ...s, settings: { ...s.settings, ...p } }));
}

export function setSync(p: Partial<SyncState>) {
  setState((s) => ({ ...s, sync: { ...s.sync, ...p } }));
}

const sortKey = (f: Flight) => f.date + (f.depSched ?? '');
/** Every non-deleted flight, flown and planned. Memoized on the flights object identity. */
let allSrc: Record<string, Flight> | null = null;
let allOut: Flight[] = [];
let loggedOut: Flight[] = [];
let plannedOut: Flight[] = [];
function split(s: State) {
  if (s.flights !== allSrc) {
    allSrc = s.flights;
    allOut = Object.values(s.flights).filter((f) => !f.deleted).sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
    loggedOut = allOut.filter((f) => !f.planned);
    plannedOut = allOut.filter((f) => f.planned).reverse(); // soonest first
  }
}
/** Logged (flown or bumped) flights, newest first. Planned flights are not included. */
export function liveFlights(s: State = state): Flight[] { split(s); return loggedOut; }
/** Planned flights, soonest first. */
export function plannedFlights(s: State = state): Flight[] { split(s); return plannedOut; }
/** Logged and planned flights together, newest first (for trips). */
export function allFlights(s: State = state): Flight[] { split(s); return allOut; }

/** A planned flight that a newly logged flight most likely corresponds to (same day + route, or same day + flight number). */
export function matchPlanned(f: Pick<Flight, 'date' | 'from' | 'to' | 'flightNumber'>, s: State = state): Flight | undefined {
  return plannedFlights(s).find((p) => p.date === f.date && ((p.from === f.from && p.to === f.to) || (!!f.flightNumber && p.flightNumber === f.flightNumber)));
}

let tripSrc: Record<string, Trip> | null = null;
let tripOut: Trip[] = [];
export function liveTrips(s: State = state): Trip[] {
  if (s.trips !== tripSrc) { tripSrc = s.trips; tripOut = Object.values(s.trips).filter((t) => !t.deleted); }
  return tripOut;
}

export function exportJSON(): string {
  return JSON.stringify({ version: 1, exportedAt: now(), flights: Object.values(state.flights), trips: Object.values(state.trips) }, null, 2);
}

export function importJSON(text: string): number {
  const data = JSON.parse(text) as { flights?: Flight[]; trips?: Trip[] };
  let n = 0;
  for (const t of data.trips ?? []) if (t.id && t.name) saveTrip(t);
  for (const f of data.flights ?? []) if (f.id && f.from && f.to) { saveFlight(f); n++; }
  return n;
}
