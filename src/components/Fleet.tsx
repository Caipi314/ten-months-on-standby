import { useMemo, useState } from 'react';
import { airframeLabel, airframes, missingAirframe, type Airframe } from '../lib/fleet';
import { dist, prettyDate } from '../lib/format';
import { openModal } from '../lib/nav';
import { liveFlights, useStore } from '../lib/store';
import FlightRow from './FlightRow';
import Sheet from './Sheet';
import './fleet.css';

type Sort = 'most' | 'recent' | 'fin';
const sorts: [Sort, string][] = [['most', 'Most flown'], ['recent', 'Recent'], ['fin', 'FIN']];

const finNum = (a: Airframe) => (a.fin && /^\d+$/.test(a.fin) ? Number(a.fin) : Infinity);
const short = (d: string) => prettyDate(d, { month: 'short', day: 'numeric', year: 'numeric' });

function AirframeRow({ a }: { a: Airframe }) {
  return (
    <button className="row chev af-row" onClick={() => openModal({ type: 'airframe', key: a.key })}>
      <div className={`af-tag${a.fin ? '' : ' reg'}`}>{a.fin ?? a.reg}</div>
      <div className="grow">
        <div className="af-title">{a.fin ? a.reg ?? 'No registration' : 'No FIN yet'}</div>
        <div className="muted af-sub">{[a.type, prettyDate(a.last, { month: 'short', year: 'numeric' })].filter(Boolean).join(' · ')}</div>
      </div>
      <span className="af-count num">{a.flights.length}×</span>
    </button>
  );
}

export default function Fleet({ depth }: { depth: number }) {
  const flights = useStore((s) => liveFlights(s));
  const list = useMemo(() => airframes(flights), [flights]);
  const missing = useMemo(() => missingAirframe(flights), [flights]);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('most');
  const [showMissing, setShowMissing] = useState(false);

  const shown = useMemo(() => {
    const needle = q.trim().toUpperCase().replace(/^FIN\s*/, '');
    const out = needle
      ? list.filter((a) => [a.fin, a.reg, a.reg?.replace('-', ''), a.type?.toUpperCase()].some((v) => v?.includes(needle)))
      : [...list];
    if (sort === 'recent') out.sort((a, b) => b.last.localeCompare(a.last));
    if (sort === 'fin') out.sort((a, b) => finNum(a) - finNum(b) || (a.fin ?? a.reg ?? '').localeCompare(b.fin ?? b.reg ?? ''));
    return out;
  }, [list, q, sort]);

  const withFin = list.filter((a) => a.fin).length;
  const repeats = list.filter((a) => a.flights.length > 1).length;

  return (
    <Sheet depth={depth} title="Fleet">
      <div className="stat-grid" style={{ marginTop: 8 }}>
        <div className="card stat"><div className="label">Airframes flown</div><div className="value">{list.length}</div></div>
        <div className="card stat"><div className="label">With a FIN</div><div className="value">{withFin}</div></div>
        <div className="card stat"><div className="label">Flown more than once</div><div className="value">{repeats}</div></div>
        <div className="card stat"><div className="label">Most on one aircraft</div><div className="value">{list[0]?.flights.length ?? 0}<span className="unit">×</span></div></div>
      </div>

      {missing.length > 0 && (
        <div className="card af-missing">
          <button className="af-missing-head" aria-expanded={showMissing} onClick={() => setShowMissing(!showMissing)}>
            <span><b>{missing.length}</b> flight{missing.length === 1 ? '' : 's'} with no FIN or registration</span>
            <span className="link">{showMissing ? 'Hide' : 'Fill in'}</span>
          </button>
          {showMissing && (
            <>
              <div className="faint" style={{ fontSize: 13, margin: '2px 0 10px' }}>Tap a flight, then Edit, to add the FIN. If you add the registration too, other flights on that aircraft fill in automatically.</div>
              <div className="list">{missing.map((f) => <FlightRow key={f.id} f={f} />)}</div>
            </>
          )}
        </div>
      )}

      {list.length ? (
        <>
          <input className="input" style={{ marginTop: 16 }} placeholder="Search FIN, registration or type" value={q}
            autoCapitalize="characters" autoCorrect="off" spellCheck={false} onChange={(e) => setQ(e.target.value)} />
          <div className="seg" style={{ marginTop: 10 }}>
            {sorts.map(([v, l]) => <button key={v} aria-pressed={sort === v} onClick={() => setSort(v)}>{l}</button>)}
          </div>
          <div className="list" style={{ marginTop: 12 }}>
            {shown.map((a) => <AirframeRow key={a.key} a={a} />)}
          </div>
          {!shown.length && <div className="empty">No aircraft match “{q}”.</div>}
        </>
      ) : (
        <div className="empty">
          <div style={{ fontSize: 44, marginBottom: 10 }}>🔢</div>
          Add a FIN (or registration) when you log a flight and every aircraft you've flown on will show up here.
        </div>
      )}
    </Sheet>
  );
}

export function AirframeDetail({ id, depth }: { id: string; depth: number }) {
  const flights = useStore((s) => liveFlights(s));
  const units = useStore((s) => s.settings.units);
  const a = useMemo(() => airframes(flights).find((x) => x.key === id), [flights, id]);
  if (!a) return <Sheet depth={depth} title="Aircraft"><div className="empty">No flown flights on this aircraft.</div></Sheet>;
  const routes = new Set(a.flights.map((f) => [f.from, f.to].sort().join('–'))).size;

  return (
    <Sheet depth={depth} title={airframeLabel(a)}>
      <div className="af-hero">
        <div className="af-hero-fin">{a.fin ?? a.reg}</div>
        <div className="muted">{[a.fin ? a.reg : null, a.type, a.airline].filter(Boolean).join(' · ') || 'Aircraft'}</div>
      </div>
      <div className="stat-grid">
        <div className="card stat"><div className="label">Times flown</div><div className="value">{a.flights.length}</div></div>
        <div className="card stat"><div className="label">Distance on it</div><div className="value">{dist(a.km, units, true)}<span className="unit">{units}</span></div></div>
        <div className="card stat"><div className="label">First flown</div><div className="value af-date">{short(a.first)}</div></div>
        <div className="card stat"><div className="label">{routes === 1 ? 'Route' : 'Routes'}</div><div className="value">{routes}</div></div>
      </div>
      <div className="section-title">Flights</div>
      <div className="list">{a.flights.map((f) => <FlightRow key={f.id} f={f} />)}</div>
    </Sheet>
  );
}
