import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

/**
 * Keep the app frame (#root) matched to what's actually visible on iOS.
 *
 * 1. Home-screen apps with a translucent status bar report a viewport that is short by the top
 *    safe-area inset, leaving a dead band at the bottom. With the keyboard closed, size the frame
 *    to the real screen height.
 * 2. When the keyboard opens, iOS doesn't resize the page; it scrolls the whole document up to
 *    reveal the focused field, which pushes sheet headers off-screen. While the keyboard is up,
 *    shrink the frame to the visual viewport (the area above the keyboard) and pin it there, so
 *    the sheet's own scroll area handles revealing the field instead.
 */
const root = document.documentElement;
let kbWasOpen = false;

function fitViewport() {
  const vv = window.visualViewport;
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  const portrait = innerHeight > innerWidth;
  const full = standalone && portrait ? Math.max(innerHeight, screen.height) : innerHeight;
  const kbOpen = !!vv && full - vv.height > 150 && isTextField(document.activeElement);

  if (kbOpen && vv) {
    root.style.setProperty('--app-h', `${Math.round(vv.height)}px`);
    root.style.setProperty('--app-top', `${Math.round(vv.pageTop)}px`);
    if (!kbWasOpen) setTimeout(revealFocused, 50);
  } else {
    root.style.setProperty('--app-h', `${full}px`);
    root.style.setProperty('--app-top', '0px');
    if (kbWasOpen) window.scrollTo(0, 0); // undo any leftover document scroll from iOS
  }
  root.classList.toggle('kb-open', kbOpen);
  kbWasOpen = kbOpen;
}

function isTextField(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !['button', 'checkbox', 'radio', 'submit', 'file', 'range', 'color'].includes(el.type);
  return (el as HTMLElement).isContentEditable;
}

/** Scroll the focused field into the middle of its own scroll container (not the document). */
function revealFocused() {
  const el = document.activeElement as HTMLElement | null;
  if (el && isTextField(el)) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

fitViewport();
addEventListener('resize', fitViewport);
addEventListener('orientationchange', () => setTimeout(fitViewport, 300));
window.visualViewport?.addEventListener('resize', fitViewport);
window.visualViewport?.addEventListener('scroll', fitViewport);
document.addEventListener('focusin', () => setTimeout(fitViewport, 0));
document.addEventListener('focusout', () => setTimeout(fitViewport, 100));
// Moving between fields while the keyboard stays up doesn't resize the viewport.
document.addEventListener('focusin', () => { if (kbWasOpen) setTimeout(revealFocused, 50); });

createRoot(document.getElementById('root')!).render(<App />);
