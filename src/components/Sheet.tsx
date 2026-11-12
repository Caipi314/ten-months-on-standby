import type { ReactNode } from 'react';
import { closeModal } from '../lib/nav';

interface Props {
  title?: ReactNode;
  left?: ReactNode; // defaults to a "Close" link
  right?: ReactNode;
  children: ReactNode;
  depth?: number;
}

/** Full-height iOS-style modal sheet. Stacks: later sheets render above earlier ones. */
export default function Sheet({ title, left, right, children, depth = 0 }: Props) {
  return (
    <>
      <div className="sheet-backdrop" style={{ zIndex: 40 + depth * 2 }} onClick={closeModal} />
      <div className="sheet" style={{ zIndex: 41 + depth * 2, top: `calc(var(--safe-top) + ${10 + depth * 8}px)` }} role="dialog" aria-modal>
        <div className="grabber" />
        <div className="sheet-head">
          <div>{left ?? <button className="link" onClick={closeModal}>Close</button>}</div>
          <h2>{title}</h2>
          <div>{right}</div>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </>
  );
}
