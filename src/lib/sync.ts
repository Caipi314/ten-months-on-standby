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
    // Full two-way reconcile on every sync. (An incremental "changed since last pull" filter is
    // unsafe here: updated_at is the editing device's clock, so rows uploaded late by another
    // device can carry timestamps older than our last pull and would never be downloaded.)
    for (const table of ['flights', 'trips'] as const) {
      // 1. Download everything this account has on the server.
      const remote = new Map<string, Row>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from(table).select('id,data,updated_at,deleted').order('id').range(from, from + 999);
        if (error) throw error;
        for (const r of (data ?? []) as Row[]) remote.set(r.id, r);
        if (!data || data.length < 1000) break;
      }

      // 2. Merge: whichever side was edited most recently wins.
      setState((st) => {
        const next = { ...st[table] } as Record<string, Flight | Trip>;
        for (const r of remote.values()) {
          const local = next[r.id];
          const remoteTime = Date.parse(r.updated_at);
          if (!local || Date.parse(local.updatedAt) < remoteTime) next[r.id] = { ...r.data, updatedAt: r.updated_at, deleted: r.deleted };
        }
        return { ...st, [table]: next };
      });

      // 3. Upload anything the server is missing or has an older copy of.
      const s = getState();
      const local = Object.values(s[table]) as (Flight | Trip)[];
      const toPush = local.filter((d) => {
        const r = remote.get(d.id);
        return !r || Date.parse(d.updatedAt) > Date.parse(r.updated_at) || !!d.deleted !== r.deleted;
      });
      for (let i = 0; i < toPush.length; i += 500) {
        const rows = toPush.slice(i, i + 500).map((d) => ({ id: d.id, data: d, updated_at: d.updatedAt, deleted: !!d.deleted }));
        const { error } = await sb.from(table).upsert(rows);
        if (error) throw error;
      }

      // Anything we just reconciled is no longer dirty (unless it was edited again meanwhile).
      const pushed = new Map(toPush.map((d) => [d.id, d.updatedAt]));
      setState((st) => ({
        ...st,
        dirty: { ...st.dirty, [table]: st.dirty[table].filter((id) => {
          const cur = st[table][id]?.updatedAt;
          const r = remote.get(id);
          return !(pushed.get(id) === cur || (r && cur && Date.parse(r.updated_at) >= Date.parse(cur)));
        }) },
      }));
    }
    setState((st) => ({ ...st, lastPull: new Date().toISOString() }));
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
