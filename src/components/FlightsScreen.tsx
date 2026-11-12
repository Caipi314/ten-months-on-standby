import { useMemo, useState } from 'react';
import { dist, hours, prettyDate, uid } from '../lib/format';
import { openModal } from '../lib/nav';
import { clearRateBy, hourBucket, minutesOf, type ClearRow } from '../lib/stats';
import { liveFlights, liveTrips, saveTrip, useStore } from '../lib/store';
import type { Flight, Trip } from '../lib/types';
import FlightRow from './FlightRow';
import './flights.css';

type View = 'flights' | 'trips' | 'standby';

export default function FlightsScreen() {
  const [view, setView] = useState<View>('flights');
  const flights = useStore((s) => liveFlights(s));
  return (
    <div className="screen">
      <div className="screen-header"><h1 className="screen-title">Flights</h1></div>
      <div className="seg" style={{ marginBottom: 8 }}>
        {(['flights', 'trips', 'standby'] as View[]).map((v) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
        ))}
      </div>
      {!flights.length && view !== 'trips' ? (
        <div className="empty">
          <div style={{ fontSize: 48, marginBottom: 12 }}>🛫</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Your passport is empty</div>
          <div style={{ marginBottom: 20 }}>Log your first standby flight and watch your map light up.</div>
          <button className="btn btn-primary" onClick={() => openModal({ type: 'add' })}>Add a flight</button>
        </div>
      ) : view === 'flights' ? <FlightList flights={flights} /> : view === 'trips' ? <TripList flights={flights} /> : <Standby flights={flights} />}
    </div>
  );
}

function FlightList({ flights }: { flights: Flight[] }) {
  const groups = useMemo(() => {
    const years: { year: string; count: number; months: { label: string; items: Flight[] }[] }[] = [];
    for (const f of flights) {
      const year = f.date.slice(0, 4);
      let y = years[years.length - 1];
      if (!y || y.year !== year) { y = { year, count: 0, months: [] }; years.push(y); }
      if (f.outcome !== 'bumped') y.count++;
      const label = prettyDate(f.date, { month: 'long' });
      let m = y.months[y.months.length - 1];
      if (!m || m.label !== label) { m = { label, items: [] }; y.months.push(m); }
      m.items.push(f);
    }
    return years;
  }, [flights]);
  return (
    <>
      {groups.map((y) => (
        <section key={y.year}>
          <div className="year-title">{y.year}<small>{y.count} flight{y.count === 1 ? '' : 's'}</small></div>
          {y.months.map((m) => (
            <div key={m.label}>
              <div className="month-title">{m.label}</div>
              <div className="list">{m.items.map((f) => <FlightRow key={f.id} f={f} />)}</div>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

export function tripLegs(flights: Flight[], tripId: string): Flight[] {
  return flights.filter((f) => f.tripId === tripId).sort((a, b) => (a.date + (a.depSched ?? '')).localeCompare(b.date + (b.depSched ?? '')));
}

export function routeChain(legs: Flight[]): string {
  const flown = legs.filter((f) => f.outcome !== 'bumped');
  if (!flown.length) return '—';
  const chain = [flown[0].from];
  for (const f of flown) { if (chain[chain.length - 1] !== f.from) chain.push(f.from); chain.push(f.to); }
  return chain.join(' → ');
}

function TripList({ flights }: { flights: Flight[] }) {
  const trips = useStore((s) => liveTrips(s));
  const units = useStore((s) => s.settings.units);
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const rows = useMemo(() => trips.map((t) => ({ t, legs: tripLegs(flights, t.id) }))
    .sort((a, b) => (b.legs[0]?.date ?? '9999').localeCompare(a.legs[0]?.date ?? '9999')), [trips, flights]);
  const create = () => {
    if (!name.trim()) return;
    const t: Trip = { id: uid(), name: name.trim(), updatedAt: '' };
    saveTrip(t); setName(''); setAdding(false);
    openModal({ type: 'trip', id: t.id });
  };
  return (
    <>
      <div style={{ margin: '16px 0' }}>
        {adding ? (
          <div className="hstack">
            <input className="input" autoFocus placeholder="Trip name, e.g. Tokyo spring" value={name}
              onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
            <button className="btn btn-primary" onClick={create} disabled={!name.trim()}>Create</button>
          </div>
        ) : <button className="btn btn-block" onClick={() => setAdding(true)}>＋ New trip</button>}
      </div>
      {!rows.length && <div className="empty">Group legs into trips, including the reroutes you took when you didn't clear.</div>}
      <div className="stack">
        {rows.map(({ t, legs }) => {
          const flown = legs.filter((f) => f.outcome !== 'bumped');
          const km = flown.reduce((s, f) => s + f.distanceKm, 0);
          const bumps = legs.length - flown.length;
          return (
            <button key={t.id} className="card" style={{ textAlign: 'left', width: '100%' }} onClick={() => openModal({ type: 'trip', id: t.id })}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: 19, fontWeight: 700 }}>{t.name}</div>
                <span className="faint chev" />
              </div>
              <div className="code" style={{ fontSize: 15, color: 'var(--accent)', margin: '6px 0' }}>{routeChain(legs)}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {legs.length ? `${prettyDate(legs[0].date, { month: 'short', day: 'numeric' })} – ${prettyDate(legs[legs.length - 1].date)}` : 'No legs yet'}
                {' · '}{flown.length} leg{flown.length === 1 ? '' : 's'}{bumps ? ` · ${bumps} bump${bumps === 1 ? '' : 's'}` : ''}
                {' · '}<span className="num">{dist(km, units)} {units}</span>
                {flown.length ? ` · ${hours(flown.reduce((s, f) => s + minutesOf(f), 0))}` : ''}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

function RateList({ title, rows }: { title: string; rows: ClearRow[] }) {
  if (!rows.length) return null;
  return (
    <>
      <div className="section-title">{title}</div>
      <div className="list">
        {rows.slice(0, 12).map((r) => (
          <div key={r.key} className="rate-row">
            <div className="top">
              <span style={{ fontWeight: 600 }}>{r.key}</span>
              <span className="num muted">{r.cleared}/{r.cleared + r.bumped} · <b style={{ color: 'var(--text)' }}>{Math.round(r.rate * 100)}%</b></span>
            </div>
            <div className="bar good"><span style={{ width: `${Math.max(2, r.rate * 100)}%` }} /></div>
          </div>
        ))}
      </div>
    </>
  );
}

function Standby({ flights }: { flights: Flight[] }) {
  const sb = flights.filter((f) => f.outcome !== 'confirmed');
  if (!sb.length) return <div className="empty">No standby attempts yet. Mark flights as <b>Cleared</b> or <b>Bumped</b> to see your clear rate.</div>;
  const cleared = sb.filter((f) => f.outcome === 'cleared').length;
  const bumped = sb.length - cleared;
  const rate = cleared / sb.length;
  return (
    <>
      <div className="card" style={{ marginTop: 16, textAlign: 'center', padding: '24px 16px' }}>
        <div className="muted" style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Clear rate</div>
        <div className="big-num" style={{ fontSize: 72, margin: '8px 0', background: 'linear-gradient(135deg, var(--good), var(--sky))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
          {Math.round(rate * 100)}%
        </div>
        <div className="hstack" style={{ justifyContent: 'center', gap: 16 }}>
          <span className="chip cleared">{cleared} cleared</span>
          <span className="chip bumped">{bumped} bumped</span>
        </div>
      </div>
      <RateList title="By route" rows={clearRateBy(sb, (f) => `${f.from} → ${f.to}`)} />
      <RateList title="By airline" rows={clearRateBy(sb, (f) => f.airline || f.flightNumber.slice(0, 2))} />
      <RateList title="By departure time" rows={clearRateBy(sb, hourBucket)} />
    </>
  );
}
