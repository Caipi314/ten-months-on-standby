import { airport } from './airports';

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function routeKm(from: string, to: string): number {
  const a = airport(from), b = airport(to);
  if (!a || !b) return 0;
  return Math.round(haversineKm(a.lat, a.lon, b.lat, b.lon));
}

/** Rough block time estimate when no schedule is known: taxi + climb overhead + cruise. */
export const estimateMinutes = (km: number) => Math.round(30 + (km / 830) * 60);

export const EARTH_CIRCUMFERENCE_KM = 40075;
export const MOON_KM = 384400;
