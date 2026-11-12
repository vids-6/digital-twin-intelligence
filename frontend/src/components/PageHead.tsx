import type { ReactNode } from 'react';
import { clock, duration, fix } from '../lib/format';
import { ROUTES, routeIndex, useRoute } from '../lib/router';
import { API_BASE } from '../lib/api';
import { useFactory } from '../state/factory';

interface PageHeadProps {
  title: string;
  lead?: ReactNode;
  spec?: { k: string; v: ReactNode; tone?: 'signal' | 'acid' }[];
  actions?: ReactNode;
  size?: 'xl' | 'lg';
}

export function PageHead({ title, lead, spec, actions, size = 'lg' }: PageHeadProps) {
  return (
    <header className={`pagehead pagehead-${size}`}>
      <div className="pagehead-main">
        <h1 className="pagehead-title">{title}</h1>
        {lead && <p className="pagehead-lead">{lead}</p>}
        {actions && <div className="pagehead-actions">{actions}</div>}
      </div>
      {spec && spec.length > 0 && (
        <dl className="spec">
          {spec.map((s) => (
            <div key={s.k} className="spec-row">
              <dt>{s.k}</dt>
              <dd className={`mono ${s.tone ? `tone-${s.tone}` : ''}`}>{s.v}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}

export function SectionHead({ title, note, right, as: Tag = 'h2' }: { title: string; note?: ReactNode; right?: ReactNode; as?: 'h2' | 'h3' }) {
  return (
    <div className="sechead">
      <div>
        <Tag className="sechead-title">{title}</Tag>
        {note && <p className="sechead-note">{note}</p>}
      </div>
      {right && <div className="sechead-right">{right}</div>}
    </div>
  );
}

/** Engineering-drawing title block. Every cell is read from live state. */
export function TitleBlock() {
  const { segments } = useRoute();
  const { overview, machines, telemetry, latency, link, lastOk } = useFactory();
  const idx = routeIndex(segments);
  const n = Object.values(telemetry)[0]?.length ?? 0;
  const host = API_BASE.replace(/^https?:\/\//, '').replace(/\/api$/, '');
  return (
    <footer className="titleblock">
      <div className="tb-cell tb-wide"><span>Sheet</span><b className="mono">{String(idx + 1).padStart(2, '0')} / {String(ROUTES.length).padStart(2, '0')} · {ROUTES[idx].title}</b></div>
      <div className="tb-cell"><span>Plant</span><b>{overview?.factory_name ?? '–'}</b></div>
      <div className="tb-cell"><span>Data source</span><b>Simulation engine · synthetic</b></div>
      <div className="tb-cell"><span>Assets</span><b className="mono">{machines.length || '–'} machines · {n} samples</b></div>
      <div className="tb-cell"><span>Sim uptime</span><b className="mono">{overview ? duration(overview.uptime_seconds) : '–'}</b></div>
      <div className="tb-cell"><span>API</span><b className="mono">{host} · {link === 'online' && latency != null ? `${fix(latency, 0)} ms` : link}</b></div>
      <div className="tb-cell"><span>Last sample</span><b className="mono">{lastOk ? clock(lastOk) : '–'}</b></div>
    </footer>
  );
}
