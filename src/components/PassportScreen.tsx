import { useMemo, useState } from 'react';
import { GearIcon, PlaneIcon } from './icons';
import CountryMap from './CountryMap';
import { liveFlights, useStore } from '../lib/store';
import { openModal } from '../lib/nav';
import { computeStats, countryName, flagEmoji, type Counted } from '../lib/stats';
import { computeBadges, type Badge } from '../lib/badges';
import { dist, hours, prettyDate, type Units } from '../lib/format';
import { EARTH_CIRCUMFERENCE_KM, MOON_KM } from '../lib/geo';
import { airport } from '../lib/airports';
import type { Flight } from '../lib/types';
import './passport.css';

function Guilloche() {
  // Layered rose curves for a banknote-like engraved pattern.
  const paths = useMemo(() => {
    const out: string[] = [];
    for (let k = 0; k < 7; k++) {
      let d = '';
      const R = 120 + k * 22, r = 18 + k * 3, n = 9 + (k % 3);
      for (let i = 0; i <= 720; i++) {
        const t = (i / 720) * Math.PI * 2;
        const rr = R + r * Math.sin(n * t);
        const x = 330 + rr * Math.cos(t), y = 40 + rr * Math.sin(t) * 0.8;
        d += (i ? 'L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
      }
      out.push(d);
    }
    return out;
  }, []);
  return (
    <svg className="guilloche" viewBox="0 0 360 260" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="gl" x1="0" x2="1"><stop offset="0" stopColor="#ffd9a0" /><stop offset="1" stopColor="#ff8fa6" /></linearGradient>
      </defs>
      {paths.map((d, i) => <path key={i} d={d} fill="none" stroke="url(#gl)" strokeWidth={0.45} />)}
    </svg>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div><span className="value">{value}</span>{unit && <span className="unit">{unit}</span>}</div>
    </div>
  );
}

function Ranked({ title, items, render }: { title: string; items: Counted[]; render: (c: Counted) => React.ReactNode }) {
  if (!items.length) return null;
  const top = items.slice(0, 5);
  const max = top[0].count;
  return (
    <>
      <div className="section-title">{title}</div>
      <div className="list pp-rank">
        {top.map((c) => (
          <div className="row" key={c.key}>
            <div className="grow">{render(c)}</div>
            <span className="cnt">{c.count}</span>
            <div className="bar"><span style={{ width: `${(c.count / max) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </>
  );
}

function RecordRow({ kind, f, units }: { kind: string; f: Flight; units: Units }) {
  return (
    <button className="row chev" onClick={() => openModal({ type: 'flight', id: f.id })}>
      <div className="grow">
        <div className="pp-rec-kind">{kind}</div>
        <div className="pp-rec-route">{f.from} → {f.to}</div>
        <div className="muted" style={{ fontSize: 13 }}>{f.flightNumber} · {prettyDate(f.date)}</div>
      </div>
      <span className="num" style={{ fontWeight: 700 }}>{dist(f.distanceKm, units)} {units}</span>
    </button>
  );
}

function BadgeTile({ b, open, onToggle }: { b: Badge; open: boolean; onToggle: () => void }) {
  const C = 2 * Math.PI * 26;
  return (
    <button className={`pp-badge ${b.earned ? 'earned' : 'locked'}`} aria-expanded={open} onClick={onToggle}>
      <div className="ring">
        <svg viewBox="0 0 58 58">
          <defs>
            <linearGradient id={`bg-${b.id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--accent)" /><stop offset="1" stopColor="var(--accent-2)" /></linearGradient>
          </defs>
          <circle cx="29" cy="29" r="26" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
          <circle cx="29" cy="29" r="26" fill="none" stroke={b.earned ? `url(#bg-${b.id})` : 'rgba(255,255,255,0.35)'} strokeWidth="3"
            strokeLinecap="round" strokeDasharray={`${C * b.progress} ${C}`} />
        </svg>
        <span className="glyph">{b.icon}</span>
      </div>
      <div className="name">{b.title}</div>
      <div className="hint">{b.earned ? 'Earned' : b.hint}</div>
    </button>
  );
}

export default function PassportScreen() {
  const all = useStore((s) => liveFlights(s));
  const units = useStore((s) => s.settings.units);
  const [year, setYear] = useState<string>('all');
  const [openBadge, setOpenBadge] = useState<string | null>(null);

  const allStats = useMemo(() => computeStats(all), [all]);
  const flights = useMemo(() => (year === 'all' ? all : all.filter((f) => f.date.startsWith(year))), [all, year]);
  const s = useMemo(() => (year === 'all' ? allStats : computeStats(flights)), [flights, allStats, year]);
  const badges = useMemo(() => computeBadges(flights, s), [flights, s]);
  const visited = useMemo(() => s.countries.map((c) => c.key), [s]);
  const earned = badges.filter((b) => b.earned).length;
  const sortedBadges = useMemo(() => [...badges].sort((a, b) => Number(b.earned) - Number(a.earned) || b.progress - a.progress), [badges]);
  const opened = badges.find((b) => b.id === openBadge);

  const header = (
    <div className="screen-header">
      <h1 className="screen-title">Passport</h1>
      <button className="gear-btn" aria-label="Settings" onClick={() => openModal({ type: 'settings' })}><GearIcon /></button>
    </div>
  );

  if (!all.length) {
    return (
      <div className="screen">
        {header}
        <div className="card empty pp-empty">
          <div className="big-icon">🛂</div>
          <h3>Your passport is empty</h3>
          <p>Log your first flight, cleared or bumped, and your stats, countries and badges will start filling in.</p>
          <button className="btn btn-primary" onClick={() => openModal({ type: 'add' })}>Add your first flight</button>
        </div>
      </div>
    );
  }

  const earthX = s.km / EARTH_CIRCUMFERENCE_KM;
  const moonPct = (s.km / MOON_KM) * 100;
  const mrz = `P<${(year === 'all' ? 'ALLTIME' : year)}<<${s.flights}FLT<<${s.airports.length}APT<<${s.countries.length}CTY<<${Math.round(s.km)}KM`.padEnd(60, '<');

  return (
    <div className="screen">
      {header}

      <div className="pp-cover">
        <Guilloche />
        <div className="pp-emblem">
          <span className="title">Standby Passport</span>
          <span className="seal"><PlaneIcon /></span>
        </div>
        <div className="pp-dist">
          <div className="cap">{year === 'all' ? 'Lifetime distance' : `Distance in ${year}`}</div>
          <span className="big-num">{dist(s.km, units)}</span><span className="unit">{units}</span>
        </div>
        <div className="pp-compare">
          <div><div className="v">{earthX >= 10 ? earthX.toFixed(0) : earthX.toFixed(2)}×</div><div className="l">around the Earth</div></div>
          <div><div className="v">{moonPct >= 100 ? `${(moonPct / 100).toFixed(1)}×` : `${moonPct.toFixed(moonPct < 10 ? 1 : 0)}%`}</div><div className="l">{moonPct >= 100 ? 'to the Moon' : 'of the way to the Moon'}</div></div>
        </div>
        <div className="pp-mrz">{mrz}</div>
      </div>

      {allStats.byYear.length > 0 && (
        <div className="pp-years">
          <button aria-pressed={year === 'all'} onClick={() => setYear('all')}>All time</button>
          {allStats.byYear.map((y) => (
            <button key={y.year} aria-pressed={year === y.year} onClick={() => setYear(y.year)}>{y.year}</button>
          ))}
        </div>
      )}

      <div className="section-title">Stats</div>
      <div className="stat-grid">
        <Stat label="Flights" value={s.flights.toLocaleString()} />
        <Stat label="Time in air" value={hours(s.minutes)} />
        <Stat label="Airports" value={String(s.airports.length)} />
        <Stat label="Airlines" value={String(s.airlines.length)} />
        <Stat label="Countries" value={String(s.countries.length)} />
        <Stat label="Aircraft types" value={String(s.aircraft.length)} />
        {s.clearRate !== null && <Stat label="Standby clear rate" value={String(Math.round(s.clearRate * 100))} unit="%" />}
        {s.clearRate !== null && <Stat label="Bumps" value={String(s.bumped)} />}
      </div>

      <div className="section-title">Countries</div>
      <div className="card pp-map-card">
        <div className="pp-map-head">
          <span><span className="num" style={{ fontSize: 22, fontWeight: 800 }}>{visited.length}</span> <span className="muted">of 195 countries</span></span>
          <span className="faint num" style={{ fontSize: 13 }}>{((visited.length / 195) * 100).toFixed(1)}% of the world</span>
        </div>
        <CountryMap visited={visited} />
        <div className="pp-chips">
          {s.countries.map((c) => (
            <span className="chip" key={c.key}>{flagEmoji(c.key)} {countryName(c.key)}<b>{c.count}</b></span>
          ))}
        </div>
      </div>

      {(s.longest || s.shortest) && (
        <>
          <div className="section-title">Records</div>
          <div className="list">
            {s.longest && <RecordRow kind="Longest flight" f={s.longest} units={units} />}
            {s.shortest && s.shortest !== s.longest && <RecordRow kind="Shortest flight" f={s.shortest} units={units} />}
          </div>
        </>
      )}

      <Ranked title="Top routes" items={s.routes} render={(c) => <span className="code">{c.key.replace('–', ' ⇄ ')}</span>} />
      <Ranked title="Top airports" items={s.airports} render={(c) => {
        const a = airport(c.key);
        return <span>{a ? flagEmoji(a.country) : ''} <span className="code">{c.key}</span> <span className="muted">{a?.city}</span></span>;
      }} />
      <Ranked title="Top airlines" items={s.airlines} render={(c) => <span>{c.key}</span>} />
      <Ranked title="Top aircraft" items={s.aircraft} render={(c) => <span>{c.key}</span>} />

      <div className="section-title">Badges · {earned} / {badges.length}</div>
      <div className="pp-badges">
        {sortedBadges.map((b) => (
          <BadgeTile key={b.id} b={b} open={openBadge === b.id} onToggle={() => setOpenBadge(openBadge === b.id ? null : b.id)} />
        ))}
      </div>
      {opened && (
        <div className="card pp-badge-desc">
          <strong>{opened.icon} {opened.title}</strong>
          <div className="muted">{opened.desc}{opened.earned ? ' · Earned' : ` · ${opened.hint}`}</div>
        </div>
      )}

      {allStats.byYear.length > 0 && (
        <>
          <div className="section-title">By year</div>
          <div className="list">
            {allStats.byYear.map((y) => (
              <button className="row" key={y.year} onClick={() => setYear(y.year)}>
                <span className="code grow" style={{ fontSize: 17 }}>{y.year}</span>
                <span className="muted num">{y.flights} flights</span>
                <span className="num" style={{ fontWeight: 700, minWidth: 90, textAlign: 'right' }}>{dist(y.km, units)} {units}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
