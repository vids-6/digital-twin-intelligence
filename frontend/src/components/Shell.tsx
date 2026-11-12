import { useLayoutEffect, useRef, useState } from 'react';
import { Command, Pause, Play, WifiOff } from 'lucide-react';
import { BrandMark } from './Glyphs';
import { ROUTES, routeIndex, useRoute } from '../lib/router';
import { useFactory } from '../state/factory';
import { useSession } from '../state/session';
import { pad2 } from '../lib/format';

export function SimStrip() {
  return (
    <div className="simstrip" role="note">
      <span className="simstrip-tag">Simulated plant</span>
      <span className="simstrip-text">Every reading and incident here comes from a software model. No physical equipment is connected.</span>
    </div>
  );
}

export function TopBar() {
  const { segments } = useRoute();
  const { overview, act, busy, link, hasData } = useFactory();
  const { setPaletteOpen } = useSession();
  const active = routeIndex(segments);
  const navRef = useRef<HTMLElement>(null);
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = navRef.current?.querySelectorAll<HTMLAnchorElement>('a')[active];
      if (el) setInd({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure);
    return () => window.removeEventListener('resize', measure);
  }, [active]);

  const running = overview?.running ?? false;
  const toggle = () => (running ? act('/simulation/pause', undefined, 'Simulation paused') : act('/simulation/start', undefined, 'Simulation running'));
  const stale = hasData && link === 'offline';
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <header className="topbar">
      <a className="brand" href="#/" aria-label="Northstar Digital Twin Intelligence, go to Command">
        <BrandMark />
        <span className="brand-text">
          <b>Northstar</b>
          <small className="mono">Digital twin intelligence</small>
        </span>
      </a>

      <nav className="nav" ref={navRef} aria-label="Primary">
        {ROUTES.map((r, i) => (
          <a key={r.path} href={`#${r.path}`} className={`nav-link ${i === active ? 'is-active' : ''}`} aria-current={i === active ? 'page' : undefined}>
            <span className="nav-n mono">{pad2(i + 1)}</span>
            <span className="nav-t">{r.nav}</span>
          </a>
        ))}
        {ind && <i className="nav-ind" style={{ transform: `translateX(${ind.x}px)`, width: ind.w }} aria-hidden="true" />}
      </nav>

      <div className="topbar-right">
        {link === 'offline' ? (
          <span className="simstate is-stale" role="status"><WifiOff size={14} /> {stale ? 'Connection lost' : 'Backend offline'}</span>
        ) : !overview ? (
          <span className="simstate" role="status"><i className="led" aria-hidden="true" /> Connecting</span>
        ) : (
          <button className={`simstate ${running ? 'is-running' : 'is-paused'}`} onClick={toggle} disabled={busy || !overview} aria-label={running ? 'Simulation running. Pause simulation' : 'Simulation paused. Resume simulation'}>
            <i className="led" aria-hidden="true" />
            <span>{running ? 'Running' : 'Paused'}</span>
            {running ? <Pause size={13} /> : <Play size={13} />}
          </button>
        )}
        <button className="kbd-btn" onClick={() => setPaletteOpen(true)} aria-label="Open command palette">
          <Command size={14} />
          <span className="mono">{isMac ? '⌘' : 'Ctrl'} K</span>
        </button>
      </div>
    </header>
  );
}

export function StaleBanner() {
  const { link, hasData, retry, error } = useFactory();
  if (!(hasData && link === 'offline')) return null;
  return (
    <div className="stale" role="alert">
      <WifiOff size={15} />
      <span>{error ?? 'Backend unreachable.'} Showing the last data received; values are not updating.</span>
      <button className="btn btn-sm" onClick={retry}>Retry</button>
    </div>
  );
}
