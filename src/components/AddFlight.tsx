import { useMemo, useRef, useState } from 'react';
import { airport } from '../lib/airports';
import { airframeKey, airframes, finIndex, normalizeFin, normalizeReg } from '../lib/fleet';
import { prettyDate, timeOf, todayISO, uid } from '../lib/format';
import { routeKm } from '../lib/geo';
import { lookupFlight, normalizeFlightNumber, type LookupResult } from '../lib/lookup';
import { closeAll, closeModal, openModal } from '../lib/nav';
import { deleteFlight, getState, liveTrips, matchPlanned, saveFlight, saveTrip, useStore } from '../lib/store';
import type { Cabin, Flight, Outcome } from '../lib/types';
import AirportPicker from './AirportPicker';
import Sheet from './Sheet';
import './flights.css';

interface Props { prefill?: Partial<Flight>; editId?: string; fly?: boolean; depth: number }

const cabins: [Cabin, string][] = [['economy', 'Economy'], ['premium', 'Premium'], ['business', 'Business'], ['first', 'First'], ['jumpseat', 'Jumpseat']];
const outcomes: [Outcome, string][] = [['cleared', 'Cleared'], ['bumped', 'Bumped'], ['confirmed', 'Confirmed']];

function addDay(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const n = new Date(y, m - 1, d + 1);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

export default function AddFlight({ prefill, editId, fly, depth }: Props) {
  const existing = editId ? getState().flights[editId] : undefined;
  const base: Partial<Flight> = existing ?? prefill ?? {};
  const trips = useStore((s) => liveTrips(s));

  const [step, setStep] = useState<'lookup' | 'form' | 'bumped'>(existing ? 'form' : 'lookup');
  const [num, setNum] = useState(base.flightNumber ?? '');
  const [date, setDate] = useState(base.date ?? todayISO());
  const [results, setResults] = useState<LookupResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [from, setFrom] = useState(base.from ?? '');
  const [to, setTo] = useState(base.to ?? '');
  const [airline, setAirline] = useState(base.airline ?? '');
  const [depTime, setDepTime] = useState(base.depSched ? timeOf(base.depSched) : '');
  const [arrTime, setArrTime] = useState(base.arrSched ? timeOf(base.arrSched) : '');
  const [aircraft, setAircraft] = useState(base.aircraft ?? '');
  const [registration, setRegistration] = useState(base.registration ?? '');
  const [fin, setFin] = useState(base.fin ?? '');
  // Which of FIN / registration we filled in from your own history (so typing the other can replace it).
  const [autoFilled, setAutoFilled] = useState<'fin' | 'reg' | null>(null);
  const known = useMemo(() => {
    const fs = Object.values(getState().flights).filter((f) => !f.deleted && f.id !== editId);
    return { ...finIndex(fs), frames: airframes(fs) };
  }, [editId]);
  const changeReg = (v: string) => {
    setRegistration(v);
    if (fin && autoFilled !== 'fin') return;
    const hit = known.finByReg.get(normalizeReg(v));
    setFin(hit ?? ''); setAutoFilled(hit ? 'fin' : null);
  };
  const changeFin = (v: string) => {
    setFin(v);
    if (registration && autoFilled !== 'reg') return;
    const hit = known.regByFin.get(normalizeFin(v));
    setRegistration(hit ?? ''); setAutoFilled(hit ? 'reg' : null);
  };
  const timesBefore = useMemo(() => {
    const f = normalizeFin(fin) || known.finByReg.get(normalizeReg(registration)) || null;
    const r = normalizeReg(registration) || (f ? known.regByFin.get(f) ?? null : null);
    const k = airframeKey(f, r);
    return k ? known.frames.find((a) => a.key === k)?.flights.length ?? 0 : 0;
  }, [fin, registration, known]);
  const [seat, setSeat] = useState(base.seat ?? '');
  const [cabin, setCabin] = useState<Cabin | null>(base.cabin ?? null);
  const [outcome, setOutcome] = useState<Outcome>(base.outcome ?? 'cleared');
  // Planned = upcoming, not flown yet. New flights dated in the future default to planned
  // until the user picks a status themselves.
  const [planned, setPlanned] = useState<boolean>(fly ? false : base.planned ?? (!existing && (base.date ?? todayISO()) > todayISO()));
  const [statusTouched, setStatusTouched] = useState(!!existing || prefill?.planned !== undefined);
  const changeDate = (d: string) => { setDate(d); if (!statusTouched && d) setPlanned(d > todayISO()); };
  const [tripId, setTripId] = useState<string | null>(base.tripId ?? null);
  const [newTrip, setNewTrip] = useState<string | null>(null);
  const [notes, setNotes] = useState(base.notes ?? '');
  // Values that came from the API (or the original record); kept unless the user overrides them.
  const [src, setSrc] = useState<Partial<Flight>>(existing ?? {});
  const [saved, setSaved] = useState<Flight | null>(null);

  // Optional return leg (new flights only): same airports reversed, saved alongside the outbound.
  const canReturn = !existing && !fly;
  const [roundTrip, setRoundTrip] = useState(false);
  const retRef = useRef<HTMLDivElement>(null);
  const [retDate, setRetDate] = useState('');
  const [retNum, setRetNum] = useState('');
  const [retDep, setRetDep] = useState('');
  const [retArr, setRetArr] = useState('');
  const [retAircraft, setRetAircraft] = useState('');
  const [retPlanned, setRetPlanned] = useState(true);
  const [retOutcome, setRetOutcome] = useState<Outcome>('cleared');
  const [retTouched, setRetTouched] = useState(false);
  const [retSrc, setRetSrc] = useState<Partial<Flight>>({});
  const [retLoading, setRetLoading] = useState(false);
  const [retMsg, setRetMsg] = useState<string | null>(null);
  const changeRetDate = (d: string) => { setRetDate(d); if (!retTouched && d) setRetPlanned(d > todayISO()); };

  async function lookupReturn() {
    setRetMsg(null); setRetLoading(true);
    try {
      const r = await lookupFlight(retNum, retDate);
      const hit = r.find((x) => x.from === to && x.to === from) ?? (r.length === 1 ? r[0] : undefined);
      if (!hit) { setRetMsg(r.length ? `${normalizeFlightNumber(retNum)} doesn't fly ${to} → ${from} that day.` : `No flight ${normalizeFlightNumber(retNum)} found on that date.`); return; }
      setRetDep(timeOf(hit.depSched) === '—' ? '' : timeOf(hit.depSched));
      setRetArr(timeOf(hit.arrSched) === '—' ? '' : timeOf(hit.arrSched));
      setRetAircraft(hit.aircraft ?? '');
      setRetSrc({ date: retDate, depSched: hit.depSched, arrSched: hit.arrSched, depActual: hit.depActual, arrActual: hit.arrActual, distanceKm: hit.distanceKm ?? undefined, durationMin: hit.durationMin, airline: hit.airline, registration: hit.registration });
      setRetMsg(`✓ Found ${hit.from} → ${hit.to}${hit.aircraft ? ` · ${hit.aircraft}` : ''}`);
    } catch (e) {
      setRetMsg(e instanceof Error ? e.message : 'Lookup failed.');
    } finally { setRetLoading(false); }
  }

  async function doLookup() {
    setError(null); setResults(null); setLoading(true);
    try {
      const r = await lookupFlight(num, date);
      if (!r.length) setError(`No flight ${normalizeFlightNumber(num)} found on that date. You can enter it manually.`);
      else if (r.length === 1) choose(r[0]);
      else setResults(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed.');
    } finally { setLoading(false); }
  }

  function choose(r: LookupResult) {
    setFrom(r.from); setTo(r.to); setAirline(r.airline);
    setDepTime(timeOf(r.depSched) === '—' ? '' : timeOf(r.depSched));
    setArrTime(timeOf(r.arrSched) === '—' ? '' : timeOf(r.arrSched));
    setAircraft(r.aircraft ?? '');
    if (r.registration) changeReg(r.registration); else setRegistration('');
    setSrc({ date, depSched: r.depSched, arrSched: r.arrSched, depActual: r.depActual, arrActual: r.arrActual, distanceKm: r.distanceKm ?? undefined, durationMin: r.durationMin });
    setStep('form');
  }

  const fromOk = !!airport(from), toOk = !!airport(to);
  const retValid = !roundTrip || (!!retDate && retDate >= date);
  const valid = fromOk && toOk && from !== to && !!date && retValid;

  // Logging a flight you'd planned replaces the plan instead of duplicating it.
  const match = !existing && !planned && valid ? matchPlanned({ date, from, to, flightNumber: normalizeFlightNumber(num) }) : undefined;
  const retMatch = roundTrip && !retPlanned && valid ? matchPlanned({ date: retDate, from: to, to: from, flightNumber: normalizeFlightNumber(retNum) }) : undefined;

  // Keep the API's full timestamp when the user didn't change the time; otherwise build one from the local time.
  function times(d: string, dep: string, arr: string, s: Partial<Flight>) {
    const keep = (t: string, orig?: string | null) => (orig && timeOf(orig) === t && d === s.date ? orig : null);
    const depSched = dep ? keep(dep, s.depSched) ?? `${d}T${dep}` : null;
    const arrSched = arr ? keep(arr, s.arrSched) ?? `${dep && arr < dep ? addDay(d) : d}T${arr}` : null;
    return { depSched, arrSched, fromSource: depSched === s.depSched && arrSched === s.arrSched };
  }

  function save() {
    if (!valid) return;
    let tId = tripId;
    if (newTrip !== null && newTrip.trim()) {
      tId = uid();
      saveTrip({ id: tId, name: newTrip.trim(), updatedAt: '' });
    }
    const { depSched, arrSched, fromSource: timesFromSource } = times(date, depTime, arrTime, src);
    const routeChanged = existing && (existing.from !== from || existing.to !== to);
    const f: Flight = {
      id: existing?.id ?? match?.id ?? uid(),
      tripId: tId ?? match?.tripId ?? null,
      date,
      flightNumber: normalizeFlightNumber(num),
      airline: airline.trim() || match?.airline || '',
      from, to,
      depSched, arrSched,
      depActual: src.depActual ?? null, arrActual: src.arrActual ?? null,
      aircraft: aircraft.trim() || null,
      registration: registration.trim().toUpperCase() || null,
      fin: normalizeFin(fin) || null,
      seat: seat.trim().toUpperCase() || match?.seat || null,
      cabin: cabin ?? match?.cabin ?? null, outcome,
      planned: planned || undefined,
      notes: notes.trim() || match?.notes || null,
      distanceKm: (!routeChanged && src.distanceKm) || routeKm(from, to),
      // Manual local times span time zones, so they can't give a true duration; stats estimate from distance instead.
      durationMin: timesFromSource && !routeChanged ? src.durationMin ?? null : null,
      updatedAt: '',
    };
    saveFlight(f);
    if (roundTrip) {
      const r = times(retDate, retDep, retArr, retSrc);
      saveFlight({
        id: retMatch?.id ?? uid(),
        tripId: tId ?? retMatch?.tripId ?? null,
        date: retDate,
        flightNumber: normalizeFlightNumber(retNum),
        airline: retSrc.airline || airline.trim() || retMatch?.airline || '',
        from: to, to: from,
        depSched: r.depSched, arrSched: r.arrSched,
        depActual: retSrc.depActual ?? null, arrActual: retSrc.arrActual ?? null,
        aircraft: retAircraft.trim() || null,
        registration: retSrc.registration || null,
        fin: (retSrc.registration && known.finByReg.get(normalizeReg(retSrc.registration))) || null,
        seat: retMatch?.seat || null,
        cabin: cabin ?? retMatch?.cabin ?? null, outcome: retOutcome,
        planned: retPlanned || undefined,
        notes: retMatch?.notes || null,
        distanceKm: retSrc.distanceKm || routeKm(to, from),
        durationMin: r.fromSource ? retSrc.durationMin ?? null : null,
        updatedAt: '',
      });
    }
    if ((!existing || fly) && !planned && outcome === 'bumped') { setSaved(f); setStep('bumped'); }
    else closeModal();
  }

  if (step === 'bumped' && saved) {
    return (
      <Sheet depth={depth} title="Bump logged" left={<span />} right={<button className="link" onClick={closeModal}>Done</button>}>
        <div className="empty">
          <div style={{ fontSize: 48 }}>🪑</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: '8px 0' }}>{saved.from} → {saved.to} didn't clear</div>
          <div style={{ marginBottom: 24 }}>Did you make it on a later flight? Log it and it'll go in the same trip.</div>
          <div className="stack">
            <button className="btn btn-primary btn-block" onClick={() => { closeModal(); openModal({ type: 'add', prefill: { from: saved.from, to: saved.to, date: saved.date, tripId: saved.tripId, outcome: 'cleared' } }); }}>
              Add the flight I cleared
            </button>
            <button className="btn btn-block" onClick={closeModal}>Not now</button>
          </div>
        </div>
      </Sheet>
    );
  }

  if (step === 'lookup') {
    return (
      <Sheet depth={depth} title={prefill?.planned ? 'Plan a flight' : 'Add flight'}>
        <div className="stack" style={{ marginTop: 8 }}>
          <div className="two">
            <div className="field">
              <label>Flight number</label>
              <input className="input code" placeholder="AC856" value={num} autoFocus autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                onChange={(e) => setNum(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && num && doLookup()} />
            </div>
            <div className="field">
              <label>Date</label>
              <input className="input" type="date" value={date} onChange={(e) => changeDate(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary btn-block" disabled={!normalizeFlightNumber(num) || !date || loading} onClick={doLookup}>
            {loading ? 'Searching…' : 'Look up flight'}
          </button>
          {error && <div className="err">{error}</div>}
          {results && (
            <>
              <div className="section-title" style={{ marginTop: 8 }}>Choose your leg</div>
              {results.map((r, i) => (
                <button key={i} className="lk" onClick={() => choose(r)}>
                  <div className="r"><span className="code">{r.from}</span><span style={{ color: 'var(--accent)', fontSize: 15 }}>✈︎</span><span className="code">{r.to}</span></div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                    {r.fromName} → {r.toName} · {timeOf(r.depSched)}–{timeOf(r.arrSched)}{r.aircraft ? ` · ${r.aircraft}` : ''}
                  </div>
                </button>
              ))}
            </>
          )}
          <button className="link" style={{ marginTop: 8, fontSize: 16 }} onClick={() => setStep('form')}>Enter manually →</button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet depth={depth} title={fly ? 'Log flight' : existing ? (existing.planned ? 'Edit planned flight' : 'Edit flight') : planned ? 'Planned flight' : 'Flight details'}
      left={existing ? undefined : <button className="link" onClick={() => setStep('lookup')}>Back</button>}
      right={<button className="link" disabled={!valid} style={{ opacity: valid ? 1 : 0.4 }} onClick={save}>Save</button>}>
      <div className="stack" style={{ marginTop: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8 }}>
          <AirportPicker label="From" value={from} onChange={setFrom} />
          <button type="button" className="swap" aria-label="Swap airports" onClick={() => { setFrom(to); setTo(from); }}>⇄</button>
          <AirportPicker label="To" value={to} onChange={setTo} />
        </div>
        {from && to && from === to && <div className="err">Origin and destination are the same.</div>}
        {canReturn && (
          <div className="seg">
            <button type="button" aria-pressed={!roundTrip} onClick={() => setRoundTrip(false)}>One way</button>
            <button type="button" aria-pressed={roundTrip} onClick={() => {
              setRoundTrip(true);
              if (!retDate && date) changeRetDate(addDay(date));
              // Scroll only the sheet body (scrollIntoView can also shift #root on iOS).
              setTimeout(() => {
                const el = retRef.current, body = el?.closest('.sheet-body');
                if (el && body) body.scrollBy({ top: el.getBoundingClientRect().top - body.getBoundingClientRect().top - 80, behavior: 'smooth' });
              }, 50);
            }}>Round trip</button>
          </div>
        )}

        <div className="field">
          <label>Status</label>
          <div className="seg status-seg">
            <button type="button" className="planned" aria-pressed={planned} onClick={() => { setPlanned(true); setStatusTouched(true); }}>Planned</button>
            {outcomes.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={!planned && outcome === v} onClick={() => { setPlanned(false); setOutcome(v); setStatusTouched(true); }}>{l}</button>
            ))}
          </div>
          {planned && <div className="hint">Shown on your map as an upcoming route. It won't count toward your stats until you log it as flown.</div>}
        </div>
        {match && (
          <div className="note">
            ✓ Matches your planned {match.from} → {match.to} on {prettyDate(match.date, { month: 'short', day: 'numeric' })}. Saving logs it as flown.
          </div>
        )}

        <div className="two">
          <div className="field"><label>Date</label><input className="input" type="date" value={date} onChange={(e) => changeDate(e.target.value)} /></div>
          <div className="field"><label>Flight number</label><input className="input code" value={num} placeholder="AC856" autoCapitalize="characters" autoCorrect="off" onChange={(e) => setNum(e.target.value.toUpperCase())} /></div>
        </div>
        <div className="field"><label>Airline</label><input className="input" value={airline} placeholder="Air Canada" onChange={(e) => setAirline(e.target.value)} /></div>
        <div className="two">
          <div className="field"><label>Departs (local)</label><input className="input" type="time" value={depTime} onChange={(e) => setDepTime(e.target.value)} /></div>
          <div className="field"><label>Arrives (local)</label><input className="input" type="time" value={arrTime} onChange={(e) => setArrTime(e.target.value)} /></div>
        </div>
        <div className="field"><label>Aircraft</label><input className="input" value={aircraft} placeholder="Boeing 787-9" onChange={(e) => setAircraft(e.target.value)} /></div>
        <div className="two">
          <div className="field"><label>FIN</label><input className="input code" value={fin} placeholder="301" inputMode="numeric" autoCorrect="off" spellCheck={false} onChange={(e) => changeFin(e.target.value.toUpperCase())} /></div>
          <div className="field"><label>Registration</label><input className="input" value={registration} placeholder="C-FNOG" autoCapitalize="characters" autoCorrect="off" spellCheck={false} onChange={(e) => changeReg(e.target.value.toUpperCase())} /></div>
        </div>
        {(timesBefore > 0 || autoFilled) && (
          <div className="hint" style={{ marginTop: -6 }}>
            {autoFilled === 'fin' ? 'FIN filled in from a previous flight on this aircraft. ' : autoFilled === 'reg' ? 'Registration filled in from a previous flight on this FIN. ' : ''}
            {timesBefore > 0 ? `You've flown this aircraft ${timesBefore === 1 ? 'once' : `${timesBefore} times`} before.` : ''}
          </div>
        )}
        <div className="field"><label>Seat</label><input className="input" value={seat} placeholder="2A" autoCapitalize="characters" onChange={(e) => setSeat(e.target.value)} /></div>
        <div className="field">
          <label>Cabin</label>
          <div className="seg wrap">
            {cabins.map(([v, l]) => <button key={v} type="button" aria-pressed={cabin === v} onClick={() => setCabin(cabin === v ? null : v)}>{l}</button>)}
          </div>
        </div>
        <div className="field">
          <label>Trip</label>
          <select className="input" value={newTrip !== null ? '__new' : tripId ?? ''}
            onChange={(e) => { if (e.target.value === '__new') setNewTrip(''); else { setNewTrip(null); setTripId(e.target.value || null); } }}>
            <option value="">None</option>
            {trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            <option value="__new">New trip…</option>
          </select>
          {newTrip !== null && <input className="input" autoFocus placeholder="Trip name" value={newTrip} onChange={(e) => setNewTrip(e.target.value)} />}
        </div>
        {canReturn && roundTrip && (
          <div className="card return-card stack" ref={retRef}>
            <div className="hstack" style={{ justifyContent: 'space-between' }}>
              <div className="code" style={{ fontSize: 17 }}>{to || '—'} <span style={{ color: 'var(--accent)' }}>✈︎</span> {from || '—'}</div>
              <span className="muted" style={{ fontSize: 13 }}>Return · same trip & cabin</span>
            </div>
            <div className="two">
              <div className="field"><label>Date</label><input className="input" type="date" value={retDate} min={date} onChange={(e) => changeRetDate(e.target.value)} /></div>
              <div className="field"><label>Flight number</label><input className="input code" value={retNum} placeholder="AC857" autoCapitalize="characters" autoCorrect="off" spellCheck={false} onChange={(e) => setRetNum(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === 'Enter' && retNum && retDate && lookupReturn()} /></div>
            </div>
            {retDate && retDate < date && <div className="err">Return is before the outbound flight.</div>}
            <button type="button" className="btn btn-block" disabled={!normalizeFlightNumber(retNum) || !retDate || retLoading} onClick={lookupReturn}>
              {retLoading ? 'Searching…' : 'Look up return'}
            </button>
            {retMsg && <div className={retMsg.startsWith('✓') ? 'hint' : 'err'}>{retMsg}</div>}
            <div className="two">
              <div className="field"><label>Departs (local)</label><input className="input" type="time" value={retDep} onChange={(e) => setRetDep(e.target.value)} /></div>
              <div className="field"><label>Arrives (local)</label><input className="input" type="time" value={retArr} onChange={(e) => setRetArr(e.target.value)} /></div>
            </div>
            <div className="field">
              <label>Status</label>
              <div className="seg status-seg">
                <button type="button" className="planned" aria-pressed={retPlanned} onClick={() => { setRetPlanned(true); setRetTouched(true); }}>Planned</button>
                {outcomes.map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={!retPlanned && retOutcome === v} onClick={() => { setRetPlanned(false); setRetOutcome(v); setRetTouched(true); }}>{l}</button>
                ))}
              </div>
            </div>
            {retMatch && <div className="note">✓ Matches your planned return. Saving logs it as flown.</div>}
          </div>
        )}
        <div className="field"><label>Notes</label><textarea className="input" value={notes} placeholder="Loads, list position, gate agent was lovely…" onChange={(e) => setNotes(e.target.value)} /></div>

        <button className="btn btn-primary btn-block" disabled={!valid} onClick={save}>{fly ? 'Log as flown' : existing ? 'Save changes' : roundTrip ? 'Add both flights' : planned ? 'Add to upcoming' : match ? 'Log planned flight' : 'Add to passport'}</button>
        {existing && (
          <button className="btn btn-block btn-danger" onClick={() => { if (confirm('Delete this flight?')) { deleteFlight(existing.id); closeAll(); } }}>Delete flight</button>
        )}
      </div>
    </Sheet>
  );
}
