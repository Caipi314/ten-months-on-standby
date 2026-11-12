export type Units = 'km' | 'mi';
export const KM_TO_MI = 0.621371;

export function dist(km: number, units: Units, compact = false): string {
  const v = units === 'mi' ? km * KM_TO_MI : km;
  if (compact && v >= 10000) return `${(v / 1000).toFixed(v >= 100000 ? 0 : 1)}k`;
  return Math.round(v).toLocaleString();
}

export function hours(min: number): string {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
}

export function timeOf(iso?: string | null): string {
  if (!iso) return '—';
  const m = iso.match(/T(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '—';
}

export function prettyDate(d: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  const [y, mo, da] = d.split('-').map(Number);
  return new Date(y, mo - 1, da).toLocaleDateString(undefined, opts);
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const uid = () => crypto.randomUUID();

/** Whole calendar days from today until a YYYY-MM-DD date (negative if past). */
export const daysUntil = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d).getTime() - t.getTime()) / 86400000);
};
