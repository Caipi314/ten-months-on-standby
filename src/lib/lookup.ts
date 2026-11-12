import { getState } from './store';

export interface LookupResult {
  flightNumber: string;
  airline: string;
  from: string;
  to: string;
  fromName: string;
  toName: string;
  depSched: string | null;
  arrSched: string | null;
  depActual: string | null;
  arrActual: string | null;
  aircraft: string | null;
  registration: string | null;
  distanceKm: number | null;
  durationMin: number | null;
  status: string | null;
}

/** "2024-05-01 08:00-04:00" → "2024-05-01T08:00-04:00" */
const iso = (t?: string | null) => (t ? t.replace(' ', 'T') : null);

interface AdbTime { local?: string; utc?: string }
interface AdbEnd {
  airport?: { iata?: string; icao?: string; name?: string; shortName?: string; municipalityName?: string };
  scheduledTime?: AdbTime; revisedTime?: AdbTime; runwayTime?: AdbTime;
}
interface AdbFlight {
  number?: string; status?: string;
  departure?: AdbEnd; arrival?: AdbEnd;
  aircraft?: { model?: string; reg?: string };
  airline?: { name?: string; iata?: string };
  greatCircleDistance?: { km?: number };
}

export const normalizeFlightNumber = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export async function lookupFlight(flightNumber: string, date: string): Promise<LookupResult[]> {
  const key = getState().settings.rapidApiKey;
  if (!key) throw new Error('Add your AeroDataBox (RapidAPI) key in Settings to auto-fill flights.');
  const num = normalizeFlightNumber(flightNumber);
  const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(num)}/${date}?withAircraftImage=false&withLocation=false&dateLocalRole=Departure`;
  const res = await fetch(url, { headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com' } });
  if (res.status === 204 || res.status === 404) return [];
  if (res.status === 401 || res.status === 403) throw new Error('The API key was rejected. Check that you are subscribed to AeroDataBox on RapidAPI.');
  if (res.status === 429) throw new Error('API rate limit reached. Try again in a minute, or enter the flight manually.');
  if (!res.ok) throw new Error(`Lookup failed (${res.status}).`);
  const data = (await res.json()) as AdbFlight[];
  return data.map((f) => {
    const depUtc = f.departure?.scheduledTime?.utc, arrUtc = f.arrival?.scheduledTime?.utc;
    const dur = depUtc && arrUtc ? Math.round((Date.parse(arrUtc.replace(' ', 'T')) - Date.parse(depUtc.replace(' ', 'T'))) / 60000) : null;
    return {
      flightNumber: num,
      airline: f.airline?.name ?? '',
      from: f.departure?.airport?.iata ?? '',
      to: f.arrival?.airport?.iata ?? '',
      fromName: f.departure?.airport?.municipalityName ?? f.departure?.airport?.name ?? '',
      toName: f.arrival?.airport?.municipalityName ?? f.arrival?.airport?.name ?? '',
      depSched: iso(f.departure?.scheduledTime?.local),
      arrSched: iso(f.arrival?.scheduledTime?.local),
      depActual: iso(f.departure?.runwayTime?.local ?? f.departure?.revisedTime?.local),
      arrActual: iso(f.arrival?.runwayTime?.local ?? f.arrival?.revisedTime?.local),
      aircraft: f.aircraft?.model ?? null,
      registration: f.aircraft?.reg ?? null,
      distanceKm: f.greatCircleDistance?.km ? Math.round(f.greatCircleDistance.km) : null,
      durationMin: dur && dur > 0 ? dur : null,
      status: f.status ?? null,
    };
  });
}
