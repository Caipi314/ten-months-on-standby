// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Flight } from '../types';

/** Minimal in-memory stand-in for the Supabase tables + auth that sync.ts uses. */
type Row = { id: string; data: unknown; updated_at: string; deleted: boolean };
const server: Record<string, Map<string, Row>> = { flights: new Map(), trips: new Map() };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { email: 'me@example.com' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: (table: string) => ({
      select: () => ({
        order: () => ({
          range: async (from: number, to: number) => ({
            data: [...server[table].values()].sort((a, b) => a.id.localeCompare(b.id)).slice(from, to + 1),
            error: null,
          }),
        }),
      }),
      upsert: async (rows: Row[]) => {
        // Postgres returns timestamptz as "+00:00", not "Z" — mimic that.
        for (const r of rows) server[table].set(r.id, { ...r, updated_at: new Date(r.updated_at).toISOString().replace('Z', '+00:00') });
        return { error: null };
      },
    }),
  }),
}));

const flight = (id: string, updatedAt: string): Flight => ({
  id, tripId: null, date: '2026-01-10', flightNumber: 'AC856', airline: 'Air Canada', from: 'YYZ', to: 'LHR',
  outcome: 'cleared', distanceKm: 5700, updatedAt,
});

/** Each "device" gets its own localStorage and a fresh copy of the store + sync modules. */
async function device(storage: Record<string, string>) {
  localStorage.clear();
  for (const [k, v] of Object.entries(storage)) localStorage.setItem(k, v);
  vi.resetModules();
  const store = await import('../store');
  const sync = await import('../sync');
  store.updateSettings({ supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'sb_publishable_test' });
  const save = () => { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; storage[k] = localStorage.getItem(k)!; } };
  return { store, sync, save };
}

beforeEach(() => { server.flights.clear(); server.trips.clear(); });

describe('sync', () => {
  it('downloads flights another device uploaded late with an older timestamp', async () => {
    const computer: Record<string, string> = {};
    const phone: Record<string, string> = {};

    // 1. Computer signs in first and syncs while empty (this used to set lastPull = now).
    let d = await device(computer);
    await d.sync.syncNow();
    d.save();
    expect(d.store.getState().lastPull).toBeTruthy();

    // 2. Phone has a flight edited a week ago, then syncs (uploads it).
    d = await device(phone);
    d.store.saveFlight(flight('f1', ''));
    d.store.setState((s) => ({ ...s, flights: { f1: { ...s.flights.f1, updatedAt: '2026-11-05T10:00:00.000Z' } } }));
    await d.sync.syncNow();
    d.save();
    expect(server.flights.has('f1')).toBe(true);

    // 3. Computer syncs again and must now have the flight.
    d = await device(computer);
    await d.sync.syncNow();
    expect(d.store.liveFlights().map((f) => f.id)).toEqual(['f1']);
    expect(d.store.getState().sync.status).toBe('idle');
  });

  it('uploads local flights the server never received, even if not marked dirty', async () => {
    const phone: Record<string, string> = {};
    const d = await device(phone);
    d.store.setState((s) => ({ ...s, flights: { f2: flight('f2', '2026-11-01T00:00:00.000Z') }, dirty: { flights: [], trips: [] } }));
    await d.sync.syncNow();
    expect(server.flights.has('f2')).toBe(true);
  });

  it('keeps the newest edit when both sides changed, and propagates deletes', async () => {
    server.flights.set('f3', { id: 'f3', data: { ...flight('f3', ''), seat: 'old' }, updated_at: '2026-11-01T00:00:00+00:00', deleted: false });
    const phone: Record<string, string> = {};
    let d = await device(phone);
    d.store.setState((s) => ({ ...s, flights: { f3: { ...flight('f3', '2026-11-02T00:00:00.000Z'), seat: 'new' } } }));
    await d.sync.syncNow();
    expect((server.flights.get('f3')!.data as Flight).seat).toBe('new');

    // Delete on the phone, then a second device should see it gone.
    d.store.deleteFlight('f3');
    await d.sync.syncNow();
    d.save();
    expect(server.flights.get('f3')!.deleted).toBe(true);

    d = await device({});
    await d.sync.syncNow();
    expect(d.store.liveFlights()).toEqual([]);
  });

  it('does not re-upload unchanged rows on every sync', async () => {
    const phone: Record<string, string> = {};
    const d = await device(phone);
    d.store.saveFlight(flight('f4', ''));
    await d.sync.syncNow();
    const first = server.flights.get('f4')!.updated_at;
    await d.sync.syncNow();
    expect(server.flights.get('f4')!.updated_at).toBe(first);
    expect(d.store.getState().dirty.flights).toEqual([]);
  });
});
