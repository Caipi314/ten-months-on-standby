import { describe, expect, it } from 'vitest';
import { airframes, finIndex, missingAirframe, normalizeFin } from '../fleet';
import type { Flight } from '../types';

let n = 0;
const fl = (p: Partial<Flight>): Flight => ({
  id: String(++n), tripId: null, date: '2026-01-01', flightNumber: 'AC1', airline: 'Air Canada',
  from: 'YYZ', to: 'YVR', outcome: 'cleared', distanceKm: 3000, updatedAt: '', ...p,
});

describe('fleet', () => {
  it('normalizes FIN input', () => {
    expect(normalizeFin(' fin #0301 ')).toBe('301');
    expect(normalizeFin('301')).toBe('301');
    expect(normalizeFin(null)).toBe('');
  });

  it('groups flights by FIN and links registration-only flights via learned pairs', () => {
    const fs = [
      fl({ date: '2026-03-01', fin: '301', registration: 'C-FIUA', aircraft: 'Boeing 777-300ER' }),
      fl({ date: '2026-02-01', registration: 'c-fiua' }), // no FIN, same reg
      fl({ date: '2026-01-01', fin: '0301' }), // FIN only
      fl({ date: '2026-01-05', fin: '512' }),
      fl({ date: '2026-01-06', fin: '512', outcome: 'bumped' }), // not flown
      fl({ date: '2026-01-07', fin: '512', planned: true }), // not flown yet
      fl({ date: '2026-01-08' }), // unknown aircraft
    ];
    const a = airframes(fs);
    expect(a.map((x) => [x.fin, x.reg, x.flights.length])).toEqual([['301', 'C-FIUA', 3], ['512', null, 1]]);
    expect(a[0].first).toBe('2026-01-01');
    expect(a[0].last).toBe('2026-03-01');
    expect(a[0].type).toBe('Boeing 777-300ER');
    expect(finIndex(fs).finByReg.get('C-FIUA')).toBe('301');
    expect(missingAirframe(fs).map((f) => f.date)).toEqual(['2026-01-08']);
  });
});
