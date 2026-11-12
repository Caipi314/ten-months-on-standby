import { useState } from 'react';
import { dist, hours, prettyDate, timeOf } from '../lib/format';
import { closeModal, openModal, showOnMap } from '../lib/nav';
import { minutesOf } from '../lib/stats';
import { allFlights, deleteTrip, saveTrip, useStore } from '../lib/store';
import FlightRow from './FlightRow';
import { routeChain, tripLegs } from './FlightsScreen';
import Sheet from './Sheet';
import './flights.css';

export default function TripDetail({ id, depth }: { id: string; depth: number }) {
  const trip = useStore((s) => s.trips[id]);
  const flights = useStore((s) => allFlights(s));
  const units = useStore((s) => s.settings.units);
  const [name, setName] = useState(trip?.name ?? '');
  if (!trip || trip.deleted) return <Sheet depth={depth} title="Trip"><div className="empty">This trip was deleted.</div></Sheet>;

  const legs = tripLegs(flights, id);
  const flown = legs.filter((f) => !f.planned && f.outcome !== 'bumped');
  const upcoming = legs.filter((f) => f.planned);
  const bumps = legs.filter((f) => !f.planned && f.outcome === 'bumped').length;
  const km = flown.reduce((s, f) => s + f.distanceKm, 0);
  const min = flown.reduce((s, f) => s + minutesOf(f), 0);
  const last = legs.filter((f) => f.planned || f.outcome !== 'bumped').pop() ?? legs[legs.length - 1];
  const commit = () => { const n = name.trim(); if (n && n !== trip.name) saveTrip({ ...trip, name: n }); else setName(trip.name); };

  return (
    <Sheet depth={depth} title="Trip">
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        style={{ fontSize: 26, fontWeight: 800, height: 56, background: 'transparent', border: '1px solid transparent', padding: '0 4px' }} />
      <div className="code" style={{ color: 'var(--accent)', margin: '2px 4px 16px', fontSize: 15 }}>{routeChain(legs)}</div>

      <div className="stat-grid">
        <div className="card stat"><div className="label">Legs flown</div><div className="value">{flown.length}</div></div>
        <div className="card stat"><div className="label">Bumps</div><div className="value" style={{ color: bumps ? 'var(--bad)' : undefined }}>{bumps}</div></div>
        <div className="card stat"><div className="label">Distance</div><div className="value">{dist(km, units, true)}<span className="unit">{units}</span></div></div>
        <div className="card stat"><div className="label">In the air</div><div className="value">{hours(min)}</div></div>
      </div>

      <div className="section-title">Timeline{upcoming.length ? ` · ${upcoming.length} planned` : ''}</div>
      {!legs.length && <div className="empty">No legs yet.</div>}
      <div className="tl">
        {legs.map((f) => (
          <div key={f.id} className={`tl-item${f.planned ? ' planned' : f.outcome === 'bumped' ? ' dim' : ''}`}>
            <div className="faint" style={{ fontSize: 12, margin: '0 0 4px 4px' }}>
              {prettyDate(f.date, { weekday: 'short', month: 'short', day: 'numeric' })}{f.depSched ? ` · ${timeOf(f.depSched)}` : ''}
            </div>
            <div className="list"><FlightRow f={f} /></div>
          </div>
        ))}
      </div>

      <div className="stack" style={{ marginTop: 20 }}>
        <div className="two">
          <button className="btn btn-primary" onClick={() => openModal({ type: 'add', prefill: { tripId: id, from: last?.to, date: last?.date, planned: last?.planned || undefined } })}>＋ Add leg</button>
          <button className="btn" disabled={!legs.length} onClick={() => { const f = flown[0] ?? upcoming[0] ?? legs[0]; if (f) showOnMap(f.id); }}>🌍 Map</button>
        </div>
        <button className="btn btn-block btn-danger" onClick={() => { if (confirm(`Delete “${trip.name}”? Its flights stay in your passport.`)) { deleteTrip(id); closeModal(); } }}>Delete trip</button>
      </div>
    </Sheet>
  );
}
