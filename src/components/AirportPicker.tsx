import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { airport, searchAirports } from '../lib/airports';
import { flagEmoji } from '../lib/stats';
import './flights.css';

interface Props { value: string; onChange: (iata: string) => void; label: string }

export default function AirportPicker({ value, onChange, label }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const results = useMemo(() => searchAirports(q, 40), [q]);
  const a = airport(value);
  return (
    <>
      <button type="button" className={`ap-btn${a ? '' : ' empty'}`} onClick={() => { setQ(''); setOpen(true); }}>
        <span className="faint" style={{ fontSize: 12, fontWeight: 600 }}>{label}</span>
        <span className="code">{a?.iata ?? '———'}</span>
        <span className="city">{a ? `${a.city || a.name}` : 'Choose airport'}</span>
      </button>
      {open && createPortal(
        <div className="ap-overlay" role="dialog" aria-modal>
          <div className="head">
            <input className="input" autoFocus placeholder="City, airport or code" value={q} onChange={(e) => setQ(e.target.value)}
              autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
            <button className="link" onClick={() => setOpen(false)}>Cancel</button>
          </div>
          <div className="results">
            {results.map((r) => (
              <button key={r.iata} className="ap-row" onClick={() => { onChange(r.iata); setOpen(false); }}>
                <span className="code">{r.iata}</span>
                <span className="grow" style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{r.city || r.name}</div>
                  <div className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                </span>
                <span className="flag">{flagEmoji(r.country)}</span>
              </button>
            ))}
            {!results.length && <div className="empty">No airports match “{q}”.</div>}
          </div>
        </div>
      , document.getElementById('root') ?? document.body)}
    </>
  );
}
