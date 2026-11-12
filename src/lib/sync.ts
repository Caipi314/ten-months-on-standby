import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getState, onLocalChange, setState, setSync } from './store';
import type { Flight, Trip } from './types';

let client: SupabaseClient | null = null;
let clientKey = '';
let pushTimer: number | undefined;
let running = false;

export function supabase(): SupabaseClient | null {
  const { supabaseUrl, supabaseAnonKey } = getState().settings;
  if (!supabaseUrl || !supabaseAnonKey) return null;
  const k = supabaseUrl + supabaseAnonKey;
  if (!client || clientKey !== k) {
    client = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: true, storageKey: 'passport.auth' } });
    clientKey = k;
    client.auth.onAuthStateChange((_e, session) => {
      setSync({ status: session ? 'idle' : 'signed-out', email: session?.user.email ?? null });
      if (session) void syncNow();
    });
  }
  return client;
}

export async function initSync() {
  const sb = supabase();
  if (!sb) { setSync({ status: 'off' }); return; }
  const { data } = await sb.auth.getSession();
  setSync({ status: data.session ? 'idle' : 'signed-out', email: data.session?.user.email ?? null });
  if (data.session) await syncNow();
}

onLocalChange(() => {
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => void syncNow(), 1500);
});
window.addEventListener('online', () => void syncNow());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void syncNow(); });

type Row = { id: string; data: Flight | Trip; updated_at: string; deleted: boolean };

export async function syncNow() {
  const sb = supabase();
  if (!sb || running || !navigator.onLine) return;
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) return;
  running = true;
  setSync({ status: 'syncing', message: null });
  try {
    const s = getState();
    // 1. Push dirty rows
    for (const table of ['flights', 'trips'] as const) {
      const ids = s.dirty[table];
      if (!ids.length) continue;
      const rows = ids
        .map((id) => s[table][id])
        .filter(Boolean)
        .map((d) => ({ id: d.id, data: d, updated_at: d.updatedAt, deleted: !!d.deleted }));
      const { error } = await sb.from(table).upsert(rows);
      if (error) throw error;
      setState((st) => ({ ...st, dirty: { ...st.dirty, [table]: st.dirty[table].filter((id) => !ids.includes(id) || st[table][id]?.updatedAt !== s[table][id]?.updatedAt) } }));
    }
    // 2. Pull remote changes since last pull
    const since = getState().lastPull ?? '1970-01-01T00:00:00Z';
    const startedAt = new Date().toISOString();
    for (const table of ['flights', 'trips'] as const) {
      const { data, error } = await sb.from(table).select('id,data,updated_at,deleted').gt('updated_at', since).limit(5000);
      if (error) throw error;
      if (!data?.length) continue;
      setState((st) => {
        const next = { ...st[table] } as Record<string, Flight | Trip>;
        for (const r of data as Row[]) {
          const local = next[r.id];
          if (!local || local.updatedAt < r.updated_at) next[r.id] = { ...r.data, updatedAt: r.updated_at, deleted: r.deleted };
        }
        return { ...st, [table]: next };
      });
    }
    setState((st) => ({ ...st, lastPull: startedAt }));
    setSync({ status: 'idle', lastSync: new Date().toISOString() });
  } catch (e) {
    setSync({ status: 'error', message: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) });
  } finally {
    running = false;
  }
}

export async function signIn(email: string, password: string, create: boolean) {
  const sb = supabase();
  if (!sb) throw new Error('Add your Supabase URL and anon key first.');
  const res = create ? await sb.auth.signUp({ email, password }) : await sb.auth.signInWithPassword({ email, password });
  if (res.error) throw res.error;
  if (create && !res.data.session) return 'Check your inbox to confirm your email, then sign in here.';
  return null;
}

export async function signOut() {
  await supabase()?.auth.signOut();
  setState((s) => ({ ...s, lastPull: null }));
}
