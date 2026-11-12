import { useMemo } from 'react';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import { numericToAlpha2 } from '../lib/stats';

type Ring = number[][];
interface Shape { a2: string; d: string }

// Equirectangular: x = lon + 180, y = 90 - lat. Crop Antarctica / far north.
const TOP = 6, BOTTOM = 150;
const pt = ([lon, lat]: number[]) => `${(lon + 180).toFixed(2)},${(90 - lat).toFixed(2)}`;

function ringPath(r: Ring): string {
  let d = '';
  for (let i = 0; i < r.length; i++) {
    // Break the subpath when a ring jumps across the antimeridian.
    const jump = i > 0 && Math.abs(r[i][0] - r[i - 1][0]) > 180;
    d += (i === 0 || jump ? 'M' : 'L') + pt(r[i]);
  }
  return d + 'Z';
}

let cache: Shape[] | null = null;
function shapes(): Shape[] {
  if (cache) return cache;
  const topo = world as unknown as Topology<{ countries: GeometryCollection }>;
  const fc = feature(topo, topo.objects.countries);
  cache = fc.features.map((f) => {
    const g = f.geometry;
    const polys: Ring[][] = g?.type === 'Polygon' ? [g.coordinates as Ring[]] : g?.type === 'MultiPolygon' ? (g.coordinates as Ring[][]) : [];
    const id = String(f.id ?? '').padStart(3, '0');
    return { a2: id ? numericToAlpha2(id) : '', d: polys.map((p) => p.map(ringPath).join('')).join('') };
  });
  return cache;
}

export default function CountryMap({ visited }: { visited: string[] }) {
  const set = useMemo(() => new Set(visited), [visited]);
  const all = shapes();
  return (
    <svg className="country-map" viewBox={`0 ${TOP} 360 ${BOTTOM - TOP}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`World map, ${visited.length} countries visited`}>
      <defs>
        <linearGradient id="cm-visited" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-2)" />
        </linearGradient>
        <filter id="cm-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g>
        {all.map((s, i) => !set.has(s.a2) && (
          <path key={i} d={s.d} fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.08)" strokeWidth={0.25} fillRule="evenodd" />
        ))}
      </g>
      <g filter="url(#cm-glow)">
        {all.map((s, i) => set.has(s.a2) && (
          <path key={i} d={s.d} fill="url(#cm-visited)" stroke="rgba(255,220,180,0.6)" strokeWidth={0.3} fillRule="evenodd" />
        ))}
      </g>
    </svg>
  );
}
