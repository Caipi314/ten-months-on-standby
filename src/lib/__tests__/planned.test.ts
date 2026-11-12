// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { allFlights, getState, liveFlights, matchPlanned, plannedFlights, saveFlight } from '../store';
import { computeStats } from '../stats';
import type { Flight } from '../types';

const f = (id: string, date: string, from: string, to: string, extra: Partial<Flight> = {}): Flight => ({
  id, tripId: null, date, flightNumber: 'AC1', airline: '', from, to, outcome: 'cleared', distanceKm: 1000, updatedAt: '', ...extra,
});

describe('planned flights', () => {
  it('are kept out of logged flights and stats, but listed separately', () => {
    saveFlight(f('a', '2026-01-01', 'YYZ', 'YVR'));
    saveFlight(f('p2', '2027-03-01', 'YYZ', 'NRT', { planned: true }));
    saveFlight(f('p1', '2027-01-01', 'YYZ', 'LHR', { planned: true, flightNumber: 'AC856' }));
    expect(liveFlights().map((x) => x.id)).toEqual(['a']);
    expect(plannedFlights().map((x) => x.id)).toEqual(['p1', 'p2']);
    expect(allFlights().map((x) => x.id)).toEqual(['p2', 'p1', 'a']);
    expect(computeStats(liveFlights()).flights).toBe(1);
  });

  it('matches a newly logged flight to its plan by route or flight number on the same day', () => {
    expect(matchPlanned({ date: '2027-01-01', from: 'YYZ', to: 'LHR', flightNumber: '' })?.id).toBe('p1');
    expect(matchPlanned({ date: '2027-01-01', from: 'YUL', to: 'LHR', flightNumber: 'AC856' })?.id).toBe('p1');
    expect(matchPlanned({ date: '2027-01-02', from: 'YYZ', to: 'LHR', flightNumber: '' })).toBeUndefined();
    // Once logged as flown it's no longer a plan.
    saveFlight({ ...getState().flights.p1, planned: undefined });
    expect(matchPlanned({ date: '2027-01-01', from: 'YYZ', to: 'LHR', flightNumber: '' })).toBeUndefined();
    expect(liveFlights().map((x) => x.id)).toContain('p1');
  });
});
