import { useEffect, useRef, useState } from 'react';
import Sheet from './Sheet';
import { exportJSON, importJSON, liveFlights, liveTrips, updateSettings, useStore } from '../lib/store';
import { initSync, signIn, signOut, syncNow } from '../lib/sync';
import { airport } from '../lib/airports';
import { todayISO } from '../lib/format';
import './passport.css';

function SecretInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-wrap">
      <input className="input" type={show ? 'text' : 'password'} value={value} placeholder={placeholder}
        autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
        onChange={(e) => onChange(e.target.value.trim())} />
      <button type="button" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
    </div>
  );
}

function SyncPanel() {
  const settings = useStore((s) => s.settings);
  const sync = useStore((s) => s.sync);
  const [url, setUrl] = useState(settings.supabaseUrl);
  const [key, setKey] = useState(settings.supabaseAnonKey);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);

  // Persist + reconnect shortly after the user stops typing.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = window.setTimeout(() => {
      updateSettings({ supabaseUrl: url.trim().replace(/\/+$/, ''), supabaseAnonKey: key.trim() });
      void initSync();
    }, 700);
    return () => window.clearTimeout(t);
  }, [url, key]);

  async function auth(create: boolean) {
    setBusy(true); setMsg(null);
    try {
      const r = await signIn(email.trim(), password, create);
      if (r) setMsg({ text: r }); else setPassword('');
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), err: true });
    } finally { setBusy(false); }
  }

  const dot = sync.status === 'idle' ? 'ok' : sync.status === 'syncing' ? 'busy' : sync.status === 'error' ? 'err' : '';
  const statusText = {
    off: 'Not connected. Your data is stored on this device only.',
    'signed-out': 'Connected to Supabase. Sign in to sync.',
    idle: `Synced${sync.lastSync ? ` · ${new Date(sync.lastSync).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : ''}`,
    syncing: 'Syncing…',
    error: `Sync error: ${sync.message ?? 'unknown'}`,
  }[sync.status];
  const signedIn = sync.status === 'idle' || sync.status === 'syncing' || (sync.status === 'error' && !!sync.email);

  return (
    <div className="stack">
      <div className="field"><label>Project URL</label>
        <input className="input" type="url" inputMode="url" placeholder="https://xxxx.supabase.co" value={url}
          autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(e) => setUrl(e.target.value)} />
      </div>
      <div className="field"><label>Anon public key</label><SecretInput value={key} onChange={setKey} placeholder="eyJhbGciOi…" /></div>
      <div className="set-status"><span className={`set-dot ${dot}`} /><span className={sync.status === 'error' ? '' : 'muted'} style={sync.status === 'error' ? { color: 'var(--bad)' } : undefined}>{statusText}</span></div>

      {sync.status === 'signed-out' && (
        <>
          <div className="field"><label>Email</label>
            <input className="input" type="email" autoComplete="username" autoCapitalize="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field"><label>Password</label>
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="hstack">
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy || !email || !password} onClick={() => auth(false)}>Sign in</button>
            <button className="btn" style={{ flex: 1 }} disabled={busy || !email || password.length < 6} onClick={() => auth(true)}>Create account</button>
          </div>
        </>
      )}

      {signedIn && (
        <>
          <div className="muted" style={{ fontSize: 14, paddingLeft: 4 }}>Signed in as <strong style={{ color: 'var(--text)' }}>{sync.email}</strong></div>
          <div className="hstack">
            <button className="btn" style={{ flex: 1 }} disabled={sync.status === 'syncing'} onClick={() => void syncNow()}>Sync now</button>
            <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => void signOut()}>Sign out</button>
          </div>
        </>
      )}
      {msg && <div className={`set-msg ${msg.err ? 'err' : ''}`}>{msg.text}</div>}

      <div className="set-help">
        Setup (one time):
        <ol>
          <li>Create a free project at <a href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a>.</li>
          <li>Open SQL Editor and run <code>supabase/schema.sql</code> from this app’s repo.</li>
          <li>Copy the Project URL and the <em>anon public</em> key from Project Settings → API into the fields above.</li>
          <li>Create an account here. If email confirmation is on, confirm it from your inbox, then sign in.</li>
        </ol>
      </div>
    </div>
  );
}

export default function Settings({ depth }: { depth: number }) {
  const settings = useStore((s) => s.settings);
  const flightCount = useStore((s) => liveFlights(s).length);
  const tripCount = useStore((s) => liveTrips(s).length);
  const [home, setHome] = useState(settings.homeAirport);
  const fileRef = useRef<HTMLInputElement>(null);
  const homeAirport = airport(home);

  async function doExport() {
    const name = `passport-backup-${todayISO()}.json`;
    const json = exportJSON();
    const file = new File([json], name, { type: 'application/json' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      try { await nav.share({ files: [file], title: name }); return; }
      catch (e) { if ((e as Error).name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function doImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const n = importJSON(await f.text());
      alert(`Imported ${n} flight${n === 1 ? '' : 's'}.`);
    } catch (err) {
      alert(`Couldn’t import that file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <Sheet depth={depth} title="Settings">
      <div className="section-title" style={{ marginTop: 8 }}>Units</div>
      <div className="seg">
        {(['km', 'mi'] as const).map((u) => (
          <button key={u} aria-pressed={settings.units === u} onClick={() => updateSettings({ units: u })}>{u === 'km' ? 'Kilometres' : 'Miles'}</button>
        ))}
      </div>

      <div className="section-title">Home airport</div>
      <div className="field">
        <input className="input code" maxLength={3} value={home} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
          onChange={(e) => {
            const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
            setHome(v);
            if (airport(v)) updateSettings({ homeAirport: v });
          }} />
        <label style={{ color: homeAirport ? 'var(--text-2)' : home.length === 3 ? 'var(--bad)' : 'var(--text-3)' }}>
          {homeAirport ? `${homeAirport.name} · ${homeAirport.city}` : home.length === 3 ? 'Unknown airport code' : 'Enter a 3-letter IATA code'}
        </label>
      </div>

      <div className="section-title">Flight lookup</div>
      <div className="stack">
        <div className="field"><label>AeroDataBox API key (RapidAPI)</label>
          <SecretInput value={settings.rapidApiKey} onChange={(v) => updateSettings({ rapidApiKey: v })} placeholder="Paste your X-RapidAPI-Key" />
        </div>
        <div className="set-help">
          Auto-fills times, aircraft and route from a flight number.
          <ol>
            <li>Sign up at <a href="https://rapidapi.com" target="_blank" rel="noreferrer">rapidapi.com</a>.</li>
            <li>Search for <strong>AeroDataBox</strong> and subscribe to the free Basic plan.</li>
            <li>Copy your <code>X-RapidAPI-Key</code> and paste it above. It’s stored only on this device.</li>
          </ol>
        </div>
      </div>

      <div className="section-title">Cloud sync</div>
      <SyncPanel />

      <div className="section-title">Data</div>
      <div className="list">
        <div className="row"><span className="grow">Flights</span><span className="num muted">{flightCount}</span></div>
        <div className="row"><span className="grow">Trips</span><span className="num muted">{tripCount}</span></div>
        <button className="row" onClick={() => void doExport()}><span className="grow link" style={{ fontSize: 16 }}>Export backup (JSON)</span></button>
        <button className="row" onClick={() => fileRef.current?.click()}><span className="grow link" style={{ fontSize: 16 }}>Import backup</span></button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void doImport(e)} />

      <p className="faint" style={{ textAlign: 'center', fontSize: 12, marginTop: 28 }}>Standby Passport · data stays on your device and your own Supabase.</p>
    </Sheet>
  );
}
