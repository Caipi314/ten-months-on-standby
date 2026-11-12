import { airport } from './airports';
import { EARTH_CIRCUMFERENCE_KM, MOON_KM } from './geo';
import { airframes } from './fleet';
import { computeStats, flown, minutesOf, type Stats } from './stats';
import type { Flight } from './types';

export interface Badge {
  id: string;
  icon: string; // emoji glyph
  title: string;
  desc: string;
  earned: boolean;
  progress: number; // 0..1
  hint?: string; // e.g. "3 / 10"
}

const step = (id: string, icon: string, title: string, desc: string, value: number, goal: number): Badge => ({
  id, icon, title, desc, earned: value >= goal, progress: Math.min(1, value / goal), hint: `${Math.min(value, goal).toLocaleString()} / ${goal.toLocaleString()}`,
});

export function computeBadges(all: Flight[], s: Stats = computeStats(all)): Badge[] {
  const fs = flown(all);
  const continents = new Set(fs.flatMap((f) => [airport(f.from), airport(f.to)]).map((a) => a && continentOf(a.lat, a.lon)).filter(Boolean));
  const crossedEquator = fs.some((f) => { const a = airport(f.from), b = airport(f.to); return a && b && Math.sign(a.lat) !== Math.sign(b.lat); });
  const crossedDateline = fs.some((f) => { const a = airport(f.from), b = airport(f.to); return a && b && Math.abs(a.lon - b.lon) > 180; });
  const longHaul = fs.filter((f) => minutesOf(f) >= 12 * 60).length;
  const redEyes = fs.filter((f) => { const h = Number(f.depSched?.match(/T(\d{2})/)?.[1] ?? 12); return h >= 21 || h < 3; }).length;
  const premium = fs.filter((f) => f.cabin === 'business' || f.cabin === 'first').length;
  const days = new Map<string, number>();
  for (const f of fs) days.set(f.date, (days.get(f.date) ?? 0) + 1);
  const maxDay = Math.max(0, ...days.values());
  const frames = airframes(all);
  const fins = frames.filter((a) => a.fin).length;
  const mostOnOne = frames[0]?.flights.length ?? 0;
  const bumpedThenCleared = all.some((b) => b.outcome === 'bumped' && all.some((c) => c.outcome === 'cleared' && c.date === b.date && c.from === b.from && c.to === b.to));

  return [
    step('first', '🛫', 'Wheels Up', 'Log your first flight', s.flights, 1),
    step('f25', '🎟️', 'Frequent Flyer', 'Fly 25 flights', s.flights, 25),
    step('f100', '💯', 'Centurion', 'Fly 100 flights', s.flights, 100),
    step('earth', '🌍', 'Around the World', 'Fly the Earth’s circumference', s.km, EARTH_CIRCUMFERENCE_KM),
    step('moon', '🌙', 'To the Moon', 'Fly the distance to the Moon', s.km, MOON_KM),
    step('c10', '🧭', 'Explorer', 'Visit 10 countries', s.countries.length, 10),
    step('c25', '🗺️', 'Globetrotter', 'Visit 25 countries', s.countries.length, 25),
    step('cont', '🌐', 'Six Continents', 'Land on 6 continents', continents.size, 6),
    step('apt50', '🏢', 'Terminal Collector', 'Visit 50 airports', s.airports.length, 50),
    step('al10', '🛩️', 'Alliance Hopper', 'Fly 10 airlines', s.airlines.length, 10),
    step('ac10', '🔧', 'Plane Spotter', 'Fly 10 aircraft types', s.aircraft.length, 10),
    step('fin25', '🔢', 'Tail Chaser', 'Fly on 25 different FINs', fins, 25),
    step('fin5x', '🤝', 'Old Friend', 'Fly the same aircraft 5 times', mostOnOne, 5),
    step('lh', '⏳', 'Ultra Long Haul', 'Fly a 12h+ flight', longHaul, 1),
    step('eq', '🧊', 'Line Crosser', 'Cross the equator', crossedEquator ? 1 : 0, 1),
    step('dl', '📅', 'Time Traveller', 'Cross the date line', crossedDateline ? 1 : 0, 1),
    step('red', '🌃', 'Red-Eye Regular', 'Take 5 red-eyes', redEyes, 5),
    step('j', '🥂', 'Lie-Flat Luck', 'Clear into business or first', premium, 1),
    step('day3', '🔁', 'Marathon Day', 'Fly 3 flights in one day', maxDay, 3),
    step('persist', '🧗', 'Persistence', 'Clear a route on the same day you got bumped from it', bumpedThenCleared ? 1 : 0, 1),
    step('bump10', '🪑', 'Gate Lice', 'Survive 10 standby bumps', s.bumped, 10),
  ];
}

/** Coarse continent classification from coordinates — good enough for a badge. */
function continentOf(lat: number, lon: number): string {
  if (lat < -60) return 'AN';
  if (lon >= -170 && lon <= -30) return lat > 12 || (lat > 7 && lon < -77) ? 'NA' : 'SA';
  if (lon > 110 && lat < -10) return 'OC';
  if (lon > 140 || lon < -170) return 'OC';
  if (lon >= -25 && lon <= 60 && lat < 37 && !(lon > 34 && lat > 12)) return 'AF';
  if (lon >= -25 && lon <= 45 && lat >= 36) return 'EU';
  return 'AS';
}
