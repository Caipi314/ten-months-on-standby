import { useMemo } from 'react';
import { airport } from '../lib/airports';
import { airframes, normalizeFin } from '../lib/fleet';
import { daysUntil, dist, hours, prettyDate, timeOf } from '../lib/format';
import { openModal, showOnMap } from '../lib/nav';
import { flagEmoji, minutesOf } from '../lib/stats';
import { liveFlights, useStore } from '../lib/store';
import './fleet.css';
import { PlaneIcon } from './icons';
import { statusChip } from './FlightRow';
import Sheet from './Sheet';
import './flights.css';

const cabinLabel: Record<string, string> = { economy: 'Economy', premium: 'Premium', business: 'Business', first: 'First', jumpseat: 'Jumpseat' };

export default function FlightDetail({ id, depth }: { id: string; depth: number }) {
  const f = useStore((s) => s.flights[id]);
  const trip = useStore((s) => (f?.tripId ? s.trips[f.tripId] : undefined));
  const units = useStore((s) => s.settings.units);
  const logged = useStore((s) => liveFlights(s));
  const frame = useMemo(() => airframes(logged).find((x) => x.flights.some((g) => g.id === id)), [logged, id]);
  if (!f || f.deleted) return <Sheet depth={depth} title="Flight"><div className="empty">This flight was deleted.</div></Sheet>;
  const a = airport(f.from), b = airport(f.to);
  const late = (sched?: string | null, act?: string | null) => act && timeOf(act) !== timeOf(sched) ? timeOf(act) : null;
  const depLate = late(f.depSched, f.depActual), arrLate = late(f.arrSched, f.arrActual);
  const chip = statusChip(f);
  const days = daysUntil(f.date);
  const cell = (k: string, v?: string | null) => <div><div className="k">{k}</div><div className="v">{v || '—'}</div></div>;

  return (
    <Sheet depth={depth} title={f.flightNumber || 'Flight'} right={<button className="link" onClick={() => openModal({ type: 'edit', id })}>Edit</button>}>
      {f.planned && (
        <div className="note" style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="grow" style={{ flex: 1 }}>
            {days > 0 ? `Departs in ${days} day${days === 1 ? '' : 's'}.` : days === 0 ? 'Departs today.' : 'This date has passed.'} Once you've flown it, log it to add it to your passport.
          </span>
          <button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={() => openModal({ type: 'edit', id, fly: true })}>I flew this</button>
        </div>
      )}
      <div className={`bp${f.planned ? ' planned' : ''}`} style={{ marginTop: 8 }}>
        <div className="bp-top">
          <div className="bp-airline">
            <span>{f.airline || 'Flight'} · <span className="code" style={{ color: 'var(--text)' }}>{f.flightNumber}</span></span>
            <span className={`chip ${chip.cls}`}>{chip.label}</span>
          </div>
          <div className="bp-route">
            <div className="end">
              <div className="iata">{f.from}</div>
              <div className="city">{a ? `${flagEmoji(a.country)} ${a.city || a.name}` : ''}</div>
              <div className="time">{timeOf(f.depSched)}</div>
              {depLate && <div className="act">Actual {depLate}</div>}
            </div>
            <div className="bp-path"><span className="line" /><PlaneIcon /><span className="line" /></div>
            <div className="end">
              <div className="iata">{f.to}</div>
              <div className="city">{b ? `${flagEmoji(b.country)} ${b.city || b.name}` : ''}</div>
              <div className="time">{timeOf(f.arrSched)}</div>
              {arrLate && <div className="act">Actual {arrLate}</div>}
            </div>
          </div>
        </div>
        <div className="bp-tear" />
        <div className="bp-grid">
          {cell('Date', prettyDate(f.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }))}
          {cell('Duration', `${hours(minutesOf(f))}${f.durationMin ? '' : ' est.'}`)}
          {cell('Distance', `${dist(f.distanceKm, units)} ${units}`)}
          {cell('Aircraft', f.aircraft)}
          {cell('FIN', normalizeFin(f.fin) || frame?.fin)}
          {cell('Reg', f.registration || frame?.reg)}
          {cell('Seat', f.seat)}
          {cell('Cabin', f.cabin ? cabinLabel[f.cabin] : null)}
        </div>
      </div>

      {frame && (
        <div className="list" style={{ marginTop: 16 }}>
          <button className="row bp-fin" onClick={() => openModal({ type: 'airframe', key: frame.key })}>
            <span className={`af-tag${frame.fin ? '' : ' reg'}`}>{frame.fin ?? frame.reg}</span>
            <span className="grow">
              <span className="faint" style={{ fontSize: 13 }}>{frame.fin ? `FIN ${frame.fin}${frame.reg ? ` · ${frame.reg}` : ''}` : 'Aircraft'}</span><br />
              <b>{frame.flights.length === 1 ? 'Only flown once' : `Flown ${frame.flights.length} times`}</b>
            </span>
            <span className="chev" />
          </button>
        </div>
      )}
      {trip && !trip.deleted && (
        <div className="list" style={{ marginTop: frame ? 10 : 16 }}>
          <button className="row" onClick={() => openModal({ type: 'trip', id: trip.id })}>
            <span className="grow"><span className="faint" style={{ fontSize: 13 }}>Trip</span><br /><b>{trip.name}</b></span>
            <span className="chev" />
          </button>
        </div>
      )}
      {f.notes && (
        <>
          <div className="section-title">Notes</div>
          <div className="card" style={{ whiteSpace: 'pre-wrap', WebkitUserSelect: 'text', userSelect: 'text' }}>{f.notes}</div>
        </>
      )}
      <div className="two" style={{ marginTop: 20 }}>
        <button className="btn" onClick={() => showOnMap(id)}>🌍 Show on map</button>
        <button className="btn" onClick={() => openModal({ type: 'edit', id })}>Edit</button>
      </div>
    </Sheet>
  );
}
