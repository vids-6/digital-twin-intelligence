import { useState, type ReactNode } from 'react';
import { Copy, Check } from 'lucide-react';
import { API_BASE } from '../lib/api';
import { BrandMark } from './Glyphs';
import { useFactory } from '../state/factory';

export function Skeleton({ w, h = 14, className = '' }: { w?: number | string; h?: number | string; className?: string }) {
  return <span className={`skeleton ${className}`} style={{ width: w ?? '100%', height: h }} aria-hidden="true" />;
}

export function EmptyState({ title, children, action, mark = 'clear' }: { title: string; children?: ReactNode; action?: ReactNode; mark?: 'clear' | 'search' | 'doc' | 'chart' }) {
  return (
    <div className="empty">
      <svg className="empty-mark" width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
        <path d="M4 14V4h10M42 4h10v10M52 42v10H42M14 52H4V42" />
        {mark === 'clear' && <path d="M18 29l7 7 13-14" />}
        {mark === 'search' && (<><circle cx="26" cy="26" r="9" /><path d="M33 33l9 9" /></>)}
        {mark === 'doc' && (<><path d="M20 15h12l6 6v20H20z" /><path d="M32 15v6h6M24 28h10M24 34h10" /></>)}
        {mark === 'chart' && <path d="M16 38V26M24 38V18M32 38V30M40 38V22" />}
      </svg>
      <h3 className="empty-title">{title}</h3>
      {children && <p className="empty-body">{children}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

const START_CMD = `cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`;

/** Shown when the very first connection fails. Once data has loaded we keep showing it (stale) with a banner instead. */
export function OfflineScreen() {
  const { retry, error, link } = useFactory();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(START_CMD); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* clipboard unavailable */ }
  };
  return (
    <section className="offline" aria-live="polite">
      <div className="offline-mark"><BrandMark size={44} /></div>
      <h1 className="offline-title">No signal from the backend</h1>
      <p className="offline-lead">{error ?? 'Waiting for the API.'} The interface is polling <span className="mono">{API_BASE}</span> every two seconds and will connect on its own once the server is up.</p>
      <div className="offline-steps">
        <p className="offline-step-head">Start the backend in a terminal</p>
        <pre className="offline-code mono">{START_CMD}</pre>
        <div className="offline-actions">
          <button className="btn" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy commands'}</button>
          <button className="btn btn-primary" onClick={retry} disabled={link === 'connecting'}>{link === 'connecting' ? 'Connecting…' : 'Try again now'}</button>
        </div>
      </div>
    </section>
  );
}

export function LoadingScreen() {
  return (
    <section className="loading" aria-busy="true" aria-label="Connecting to the factory">
      <div className="loading-bar"><i /></div>
      <p className="mono muted">Connecting to {API_BASE}</p>
      <div className="loading-grid">
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} h={220} />)}
      </div>
    </section>
  );
}
