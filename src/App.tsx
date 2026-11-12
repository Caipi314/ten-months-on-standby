import { lazy, Suspense, useEffect } from 'react';
import { GlobeIcon, ListIcon, PassportIcon, PlusIcon } from './components/icons';
import { openModal, setTab, useNav, type Modal, type Tab } from './lib/nav';
import { initSync } from './lib/sync';
import FlightsScreen from './components/FlightsScreen';
import PassportScreen from './components/PassportScreen';
import AddFlight from './components/AddFlight';
import FlightDetail from './components/FlightDetail';
import TripDetail from './components/TripDetail';
import Settings from './components/Settings';

const GlobeScreen = lazy(() => import('./components/GlobeScreen'));

function ModalView({ m, depth }: { m: Modal; depth: number }) {
  switch (m.type) {
    case 'add': return <AddFlight prefill={m.prefill} depth={depth} />;
    case 'edit': return <AddFlight editId={m.id} depth={depth} />;
    case 'flight': return <FlightDetail id={m.id} depth={depth} />;
    case 'trip': return <TripDetail id={m.id} depth={depth} />;
    case 'settings': return <Settings depth={depth} />;
  }
}

const tabs: { id: Tab; label: string; icon: () => React.JSX.Element }[] = [
  { id: 'map', label: 'Map', icon: GlobeIcon },
  { id: 'flights', label: 'Flights', icon: ListIcon },
  { id: 'passport', label: 'Passport', icon: PassportIcon },
];

export default function App() {
  const nav = useNav();
  useEffect(() => { void initSync(); }, []);

  return (
    <>
      {/* The globe stays mounted so returning to the map is instant. */}
      <div style={{ position: 'absolute', inset: 0, visibility: nav.tab === 'map' ? 'visible' : 'hidden' }}>
        <Suspense fallback={null}><GlobeScreen active={nav.tab === 'map'} /></Suspense>
      </div>
      {nav.tab === 'flights' && <FlightsScreen />}
      {nav.tab === 'passport' && <PassportScreen />}

      <div className="dock">
        <nav className="tabbar">
          {tabs.map((t) => (
            <button key={t.id} className="tab" aria-current={nav.tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              <t.icon />{t.label}
            </button>
          ))}
        </nav>
        <button className="fab" aria-label="Add flight" onClick={() => openModal({ type: 'add' })}><PlusIcon /></button>
      </div>

      {nav.modals.map((m, i) => <ModalView key={i} m={m} depth={i} />)}
    </>
  );
}
