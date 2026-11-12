import { useEffect, useMemo, useRef, useState } from 'react';
import Globe, { type GlobeInstance } from 'globe.gl';
import { MeshPhongMaterial, Color } from 'three';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import { airport } from '../lib/airports';
import { clearFocus, openModal, useNav } from '../lib/nav';
import { liveFlights, useStore } from '../lib/store';
import { computeStats, flown, numericToAlpha2 } from '../lib/stats';
import { dist, prettyDate } from '../lib/format';
import type { Flight } from '../lib/types';
import './globe.css';

interface Arc { key: string; flight: Flight; startLat: number; startLng: number; endLat: number; endLng: number; count: number; km: number }
interface Pt { iata: string; lat: number; lng: number; visits: number }

const countriesGeo = feature(
  world as unknown as Topology,
  (world as unknown as Topology).objects.countries as GeometryCollection,
).features;

const AMBER = '#ffb547';
const CORAL = '#ff6b8b';

/** Great-circle midpoint, for pointing the camera at a route. */
function midpoint(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const [φ1, λ1, φ2, λ2] = [a.lat * r, a.lng * r, b.lat * r, b.lng * r];
  const Bx = Math.cos(φ2) * Math.cos(λ2 - λ1), By = Math.cos(φ2) * Math.sin(λ2 - λ1);
  const φ = Math.atan2(Math.sin(φ1) + Math.sin(φ2), Math.sqrt((Math.cos(φ1) + Bx) ** 2 + By ** 2));
  const λ = λ1 + Math.atan2(By, Math.cos(φ1) + Bx);
  return { lat: φ / r, lng: ((λ / r + 540) % 360) - 180 };
}

export default function GlobeScreen({ active }: { active: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const globe = useRef<GlobeInstance | null>(null);
  const flights = useStore((s) => liveFlights(s));
  const units = useStore((s) => s.settings.units);
  const home = useStore((s) => s.settings.homeAirport);
  const { focusFlight } = useNav();
  const [selected, setSelected] = useState<string | null>(null);
  const carousel = useRef<HTMLDivElement>(null);

  const done = useMemo(() => flown(flights), [flights]);
  const stats = useMemo(() => computeStats(flights), [flights]);

  const { arcs, points, visited } = useMemo(() => {
    const routes = new Map<string, Arc>();
    const pts = new Map<string, Pt>();
    for (const f of done) {
      const a = airport(f.from), b = airport(f.to);
      if (!a || !b) continue;
      const key = [f.from, f.to].sort().join('-');
      const r = routes.get(key);
      if (r) r.count++;
      else routes.set(key, { key, flight: f, startLat: a.lat, startLng: a.lon, endLat: b.lat, endLng: b.lon, count: 1, km: f.distanceKm });
      for (const ap of [a, b]) {
        const p = pts.get(ap.iata);
        if (p) p.visits++; else pts.set(ap.iata, { iata: ap.iata, lat: ap.lat, lng: ap.lon, visits: 1 });
      }
    }
    return { arcs: [...routes.values()], points: [...pts.values()], visited: new Set(stats.countries.map((c) => c.key)) };
  }, [done, stats]);

  const selectedKey = useMemo(() => {
    const f = flights.find((x) => x.id === selected);
    return f ? [f.from, f.to].sort().join('-') : null;
  }, [selected, flights]);

  // --- Create globe once ---
  useEffect(() => {
    if (!el.current) return;
    const g = new Globe(el.current, { rendererConfig: { antialias: true, alpha: true, powerPreference: 'high-performance' } })
      .backgroundColor('rgba(0,0,0,0)')
      .showAtmosphere(true)
      .atmosphereColor('#4d8dff')
      .atmosphereAltitude(0.2)
      .showGraticules(false)
      .globeMaterial(new MeshPhongMaterial({ color: new Color('#0a1222'), emissive: new Color('#060b16'), shininess: 8, transparent: false }))
      .polygonsData(countriesGeo)
      .polygonAltitude(0.004)
      .polygonSideColor(() => 'rgba(0,0,0,0)')
      .polygonStrokeColor(() => 'rgba(140,170,230,0.16)')
      .polygonCapCurvatureResolution(4)
      .arcStartLat('startLat').arcStartLng('startLng').arcEndLat('endLat').arcEndLng('endLng')
      .arcAltitudeAutoScale(0.42)
      .arcCurveResolution(48)
      .arcsTransitionDuration(600)
      .pointLat('lat').pointLng('lng')
      .pointAltitude(0.006)
      .pointColor(() => '#ffe2b0')
      .pointsMerge(false)
      .labelLat('lat').labelLng('lng')
      .labelText('iata')
      .labelColor(() => 'rgba(255,236,210,0.85)')
      .labelSize(0.55)
      .labelDotRadius(0)
      .labelAltitude(0.008)
      .labelResolution(2)
      .ringLat('lat').ringLng('lng')
      .ringColor(() => (t: number) => `rgba(255,181,71,${1 - t})`)
      .ringMaxRadius(3.2)
      .ringPropagationSpeed(1.6)
      .ringRepeatPeriod(1400)
      .onArcClick((a) => setSelected((a as Arc).flight.id))
      .onGlobeClick(() => setSelected(null));

    g.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const c = g.controls();
    c.autoRotate = true;
    c.autoRotateSpeed = 0.35;
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minDistance = 130;
    c.maxDistance = 600;
    c.addEventListener('start', () => { c.autoRotate = false; });

    const h = airport(home);
    g.pointOfView({ lat: h?.lat ?? 30, lng: h?.lon ?? -40, altitude: 2.7 }, 0);

    const resize = () => { if (el.current) g.width(el.current.clientWidth).height(el.current.clientHeight); };
    resize();
    window.addEventListener('resize', resize);
    globe.current = g;
    return () => { window.removeEventListener('resize', resize); g._destructor(); globe.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pause rendering when the map tab is hidden (battery!)
  useEffect(() => {
    const g = globe.current as (GlobeInstance & { resumeAnimation(): void }) | null;
    if (!g) return;
    if (active) { g.resumeAnimation(); if (el.current) g.width(el.current.clientWidth).height(el.current.clientHeight); }
    else g.pauseAnimation();
  }, [active]);

  // --- Data layers ---
  useEffect(() => {
    const g = globe.current;
    if (!g) return;
    g.polygonCapColor((d: object) => {
      const id = String((d as { id?: string | number }).id ?? '').padStart(3, '0');
      return visited.has(numericToAlpha2(id)) ? 'rgba(255,181,71,0.20)' : 'rgba(120,150,210,0.07)';
    });
    g.arcsData(arcs)
      .arcColor((a: object) => {
        const arc = a as Arc;
        if (selectedKey && arc.key !== selectedKey) return ['rgba(255,181,71,0.18)', 'rgba(255,107,139,0.18)'];
        return [AMBER, CORAL];
      })
      .arcStroke((a: object) => {
        const arc = a as Arc;
        const base = Math.min(0.9, 0.32 + arc.count * 0.08);
        return arc.key === selectedKey ? base + 0.25 : base;
      })
      .arcDashLength((a: object) => ((a as Arc).key === selectedKey ? 0.5 : 1))
      .arcDashGap((a: object) => ((a as Arc).key === selectedKey ? 0.08 : 0))
      .arcDashAnimateTime((a: object) => ((a as Arc).key === selectedKey ? 1600 : 0));
    g.pointsData(points).pointRadius((p: object) => Math.min(0.55, 0.18 + (p as Pt).visits * 0.025));
    // Only label the busiest airports to keep the globe clean
    g.labelsData([...points].sort((a, b) => b.visits - a.visits).slice(0, 40));
    const last = done[0] && airport(done[0].to);
    g.ringsData(last ? [{ lat: last.lat, lng: last.lon }] : []);
  }, [arcs, points, visited, selectedKey, done]);

  // --- Focus a flight (from carousel or "Show on map") ---
  const focus = (id: string) => {
    const f = flights.find((x) => x.id === id);
    const a = f && airport(f.from), b = f && airport(f.to);
    if (!f || !a || !b || !globe.current) return;
    setSelected(id);
    globe.current.controls().autoRotate = false;
    const m = midpoint({ lat: a.lat, lng: a.lon }, { lat: b.lat, lng: b.lon });
    const alt = Math.min(3, 1.3 + f.distanceKm / 5000);
    globe.current.pointOfView({ ...m, lat: m.lat - alt * 5, altitude: alt }, 1200);
  };

  useEffect(() => {
    if (focusFlight) { focus(focusFlight); clearFocus(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusFlight]);

  // Keep carousel in sync with selected arc
  useEffect(() => {
    if (!selected || !carousel.current) return;
    carousel.current.querySelector(`[data-id="${selected}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [selected]);

  const recent = flights.slice(0, 30);

  return (
    <div className="globe-screen">
      <div ref={el} className="globe-canvas" />
      <div className="globe-vignette" />

      <header className="globe-top">
        <div className="globe-brand">
          <span className="globe-kicker">Standby Passport</span>
          <span className="globe-total num">{dist(stats.km, units, true)}<small>{units}</small></span>
        </div>
        <div className="globe-pills">
          <span><b className="num">{stats.flights}</b> flights</span>
          <span><b className="num">{stats.airports.length}</b> airports</span>
          <span><b className="num">{stats.countries.length}</b> countries</span>
          {stats.clearRate != null && <span><b className="num">{Math.round(stats.clearRate * 100)}%</b> cleared</span>}
        </div>
      </header>

      <div className="globe-carousel" ref={carousel}>
        {recent.length === 0 && (
          <button className="gcard gcard-empty" onClick={() => openModal({ type: 'add' })}>
            <span className="gcard-title">Your sky is empty</span>
            <span className="muted">Tap to log your first flight ✈︎</span>
          </button>
        )}
        {recent.map((f) => {
          const a = airport(f.from), b = airport(f.to);
          return (
            <button
              key={f.id}
              data-id={f.id}
              className={`gcard ${selected === f.id ? 'on' : ''} ${f.outcome === 'bumped' ? 'bumped' : ''}`}
              onClick={() => (selected === f.id ? openModal({ type: 'flight', id: f.id }) : focus(f.id))}
            >
              <div className="gcard-row">
                <span className="code gcard-code">{f.from}</span>
                <span className="gcard-line"><i /></span>
                <span className="code gcard-code">{f.to}</span>
              </div>
              <div className="gcard-row gcard-sub">
                <span>{a?.city ?? ''}</span>
                <span>{b?.city ?? ''}</span>
              </div>
              <div className="gcard-row gcard-meta">
                <span>{prettyDate(f.date, { month: 'short', day: 'numeric', year: '2-digit' })} · {f.flightNumber}</span>
                <span className={`chip ${f.outcome}`}>{f.outcome}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
