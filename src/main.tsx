import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

/**
 * iOS home-screen apps with a translucent status bar report a viewport that is short by the
 * top safe-area inset, leaving a dead band at the bottom. In standalone portrait mode, size the
 * app frame to the real screen height instead.
 */
function fitAppHeight() {
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  const portrait = innerHeight > innerWidth;
  const h = standalone && portrait ? Math.max(innerHeight, screen.height) : innerHeight;
  document.documentElement.style.setProperty('--app-h', `${h}px`);
}
fitAppHeight();
addEventListener('resize', fitAppHeight);
addEventListener('orientationchange', () => setTimeout(fitAppHeight, 300));

createRoot(document.getElementById('root')!).render(<App />);
