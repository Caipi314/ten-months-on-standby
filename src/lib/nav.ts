import { useSyncExternalStore } from 'react';
import type { Flight } from './types';

export type Tab = 'map' | 'flights' | 'passport';
export type Modal =
  | { type: 'add'; prefill?: Partial<Flight> } // new flight (prefill e.g. tripId) …
  | { type: 'edit'; id: string; fly?: boolean } // … or edit existing (fly: log a planned flight as flown)
  | { type: 'flight'; id: string } // flight detail / boarding-pass view
  | { type: 'trip'; id: string } // trip detail
  | { type: 'settings' }
  | { type: 'fleet' } // every FIN / airframe flown
  | { type: 'airframe'; key: string }; // one airframe's flights

interface Nav { tab: Tab; modals: Modal[]; focusFlight: string | null }
let nav: Nav = { tab: 'map', modals: [], focusFlight: null };
const ls = new Set<() => void>();
const emit = (n: Nav) => { nav = n; ls.forEach((l) => l()); };

export const useNav = () => useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => nav);
export const setTab = (tab: Tab) => emit({ ...nav, tab });
export const openModal = (m: Modal) => emit({ ...nav, modals: [...nav.modals, m] });
export const closeModal = () => emit({ ...nav, modals: nav.modals.slice(0, -1) });
export const closeAll = () => emit({ ...nav, modals: [] });
/** Jump to the map tab and fly the camera to a flight's arc. */
export const showOnMap = (id: string) => emit({ tab: 'map', modals: [], focusFlight: id });
export const clearFocus = () => emit({ ...nav, focusFlight: null });
