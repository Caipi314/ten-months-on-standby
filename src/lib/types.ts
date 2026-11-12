export type Outcome = 'cleared' | 'bumped' | 'confirmed';
export type Cabin = 'economy' | 'premium' | 'business' | 'first' | 'jumpseat';

export interface Flight {
  id: string;
  tripId: string | null;
  date: string; // YYYY-MM-DD (local departure date)
  flightNumber: string; // e.g. AC856
  airline: string; // display name
  from: string; // IATA
  to: string; // IATA
  depSched?: string | null; // ISO with offset (local)
  arrSched?: string | null;
  depActual?: string | null;
  arrActual?: string | null;
  aircraft?: string | null;
  registration?: string | null;
  /** Fleet identification number painted on the aircraft (e.g. Air Canada FIN 301). */
  fin?: string | null;
  seat?: string | null;
  cabin?: Cabin | null;
  outcome: Outcome;
  /** Upcoming flight that hasn't been flown yet. Excluded from stats until it's logged as flown. */
  planned?: boolean;
  notes?: string | null;
  distanceKm: number;
  durationMin?: number | null;
  updatedAt: string;
  deleted?: boolean;
}

export interface Trip {
  id: string;
  name: string;
  notes?: string | null;
  updatedAt: string;
  deleted?: boolean;
}

export interface Airport {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string; // ISO alpha-2
  lat: number;
  lon: number;
  size: number; // 3 large, 2 medium, 1 small
}
