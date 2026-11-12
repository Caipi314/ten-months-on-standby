import { airport } from '../lib/airports';
import { dist, hours, todayISO } from '../lib/format';
import { openModal } from '../lib/nav';
import { minutesOf } from '../lib/stats';
import { useStore } from '../lib/store';
import type { Flight } from '../lib/types';
import './flights.css';

/** Status chip for a flight: outcome for logged flights, Planned / Did you fly? for upcoming ones. */
export function statusChip(f: Flight): { cls: string; label: string } {
  if (f.planned) return f.date < todayISO() ? { cls: 'due', label: 'Did you fly?' } : { cls: 'planned', label: 'Planned' };
  return { cls: f.outcome, label: outcomeLabel[f.outcome] };
}

export const outcomeLabel = { cleared: 'Cleared', bumped: 'Bumped', confirmed: 'Confirmed' } as const;

export default function FlightRow({ f }: { f: Flight }) {
  const units = useStore((s) => s.settings.units);
  const [y, m, d] = f.date.split('-').map(Number);
  const month = new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short' });
  const a = airport(f.from), b = airport(f.to);
  const chip = statusChip(f);
  return (
    <button className={`fr${f.planned ? ' planned' : f.outcome === 'bumped' ? ' dim' : ''}`} onClick={() => openModal({ type: 'flight', id: f.id })}>
      <div className="fr-date"><div className="d">{d}</div><div className="m">{month}</div></div>
      <div style={{ minWidth: 0 }}>
        <div className="fr-route"><span className="code">{f.from}</span><span className="arrow">✈︎</span><span className="code">{f.to}</span></div>
        <div className="fr-sub">{a?.city ?? f.from} → {b?.city ?? f.to}</div>
        <div className="fr-sub faint">{f.flightNumber}{f.airline ? ` · ${f.airline}` : ''}</div>
      </div>
      <div className="fr-right">
        <span className={`chip ${chip.cls}`}>{chip.label}</span>
        <span className="num">{dist(f.distanceKm, units)} {units}</span>
        <span className="num faint">{hours(minutesOf(f))}</span>
      </div>
    </button>
  );
}
