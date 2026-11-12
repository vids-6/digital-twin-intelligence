import { useMemo, useState } from 'react';
import { PageHead, SectionHead } from '../components/PageHead';
import { EmptyState, Skeleton } from '../components/States';
import { API_BASE, useRequestLog, type LogEntry } from '../lib/api';
import { ago, clock, duration, fix } from '../lib/format';
import { useNow } from '../lib/motion';
import { useFactory } from '../state/factory';

type Tone = 'up' | 'off' | 'down' | 'wait';
interface Service { id: string; name: string; role: string; tone: Tone; state: string; detail: string }

const TONE_LABEL: Record<Tone, string> = { up: 'Up', off: 'Not configured', down: 'Unreachable', wait: 'Checking' };

export function System() {
  const { link, latency, system, overview, lastOk, error } = useFactory();
  const now = useNow(1000);
  const log = useRequestLog();
  const [showPolls, setShowPolls] = useState(true);

  const online = link === 'online';
  const services: Service[] = useMemo(() => {
    const t = (ok: boolean | undefined): Tone => (link === 'offline' ? 'down' : system == null ? 'wait' : ok ? 'up' : 'off');
    return [
      { id: 'api', name: 'API server', role: 'FastAPI on Uvicorn', tone: link === 'connecting' ? 'wait' : online ? 'up' : 'down', state: online ? 'Responding' : link === 'connecting' ? 'Connecting' : 'No response', detail: online ? `${fix(latency, 0)} ms to answer the last request` : error ?? 'Waiting for the first response' },
      { id: 'sim', name: 'Simulation engine', role: 'In-process thread, one tick every 2 s', tone: t(system?.simulation_running), state: system ? (system.simulation_running ? 'Ticking' : 'Paused') : '–', detail: overview ? `${overview.machine_count} simulated machines, up ${duration(overview.uptime_seconds)}` : 'Waiting for data' },
      { id: 'vec', name: 'Vector store', role: 'Passage index for retrieval', tone: t(!!system?.vector_database), state: system?.vector_database ?? '–', detail: system ? `${system.chunks_indexed} passages in ${system.documents_indexed} documents` : 'Waiting for data' },
      { id: 'emb', name: 'Embedding model', role: 'Turns text into vectors', tone: t(!!system?.embedding_model), state: system?.embedding_model ?? '–', detail: system?.embedding_model?.toLowerCase().includes('hash') ? 'Built-in fallback. Matches shared words, not meaning. Install sentence-transformers for semantic search.' : 'Semantic embeddings' },
      { id: 'llm', name: 'Language model', role: 'Optional, for written answers', tone: link === 'offline' ? 'down' : system == null ? 'wait' : system.llm_configured ? 'up' : 'off', state: system ? (system.llm_configured ? 'Configured' : 'Not configured') : '–', detail: system?.llm_configured ? `Model ${system.llm_model}` : 'Without one, the Investigator shows retrieved passages and fixed template wording. Set LLM_API_KEY on the server to enable it.' },
    ];
  }, [link, online, latency, system, overview, error]);

  const polls = log.filter((l) => l.poll).length;
  const rows = showPolls ? log : log.filter((l) => !l.poll);
  const slowest = log.reduce<LogEntry | null>((m, l) => (l.status !== 'ERR' && (!m || l.ms > m.ms) ? l : m), null);
  const failed = log.filter((l) => l.status === 'ERR' || (typeof l.status === 'number' && l.status >= 400)).length;
  const median = useMemo(() => {
    const ms = log.filter((l) => l.status !== 'ERR').map((l) => l.ms).sort((a, b) => a - b);
    return ms.length ? ms[Math.floor(ms.length / 2)] : null;
  }, [log]);

  return (
    <>
      <PageHead
        title="System"
        lead="What this interface is connected to, and whether each part is answering right now."
        spec={[
          { k: 'Link', v: link === 'online' ? 'Online' : link === 'offline' ? 'Offline' : 'Connecting', tone: link === 'online' ? 'acid' : link === 'offline' ? 'signal' : undefined },
          { k: 'Last reply', v: lastOk ? `${ago(lastOk, now)}` : '–' },
          { k: 'Median latency', v: median != null ? `${median} ms` : '–' },
          { k: 'Data', v: 'Simulated plant' },
        ]}
      />

      <section className="block">
        <SectionHead title="Services" note="Reported by GET /api/system/status and the polling link. Nothing here is estimated." />
        {!system && link !== 'offline' ? <Skeleton h={260} /> : (
          <ul className="svcs">
            {services.map((s) => (
              <li key={s.id} className={`svc svc-${s.tone}`}>
                <span className="svc-dot" aria-hidden="true" />
                <div className="svc-main">
                  <b>{s.name}</b>
                  <span>{s.role}</span>
                </div>
                <div className="svc-state">
                  <span className="mono svc-name">{s.state}</span>
                  {TONE_LABEL[s.tone].toLowerCase() !== s.state.toLowerCase() && <span className="svc-tone">{TONE_LABEL[s.tone]}</span>}
                </div>
                <p className="svc-detail">{s.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="block">
        <SectionHead title="How the parts connect" note="The diagram takes its colours from the checks above." />
        <Architecture services={services} />
      </section>

      <section className="block">
        <SectionHead
          title="Network console"
          note={`Requests this page has made since it opened. ${polls} are background polling.`}
          right={<label className="check"><input type="checkbox" checked={showPolls} onChange={(e) => setShowPolls(e.target.checked)} /> Show polling</label>}
        />
        <dl className="netstats">
          <div><dt>Recorded</dt><dd className="mono">{log.length}</dd></div>
          <div><dt>Failed</dt><dd className={`mono ${failed ? 'tone-signal' : ''}`}>{failed}</dd></div>
          <div><dt>Median</dt><dd className="mono">{median != null ? `${median} ms` : '–'}</dd></div>
          <div><dt>Slowest</dt><dd className="mono">{slowest ? `${slowest.ms} ms` : '–'}</dd></div>
        </dl>
        {rows.length === 0 ? (
          <EmptyState title="No requests to show" mark="clear">
            {showPolls ? 'Nothing has been requested yet.' : 'Only background polling has run so far. Start a simulation action, search the library or run an evaluation, or show polling.'}
          </EmptyState>
        ) : (
          <div className="table-scroll console" role="region" aria-label="Recent requests" tabIndex={0}>
            <table className="tbl">
              <thead><tr><th>Time</th><th>Method</th><th>Path</th><th className="r">Status</th><th className="r">Time taken</th></tr></thead>
              <tbody>
                {rows.slice(0, 40).map((l) => {
                  const bad = l.status === 'ERR' || (typeof l.status === 'number' && l.status >= 400);
                  return (
                    <tr key={l.id} className="mono">
                      <td>{clock(l.at)}</td><td>{l.method}</td><td className="net-path">{l.path}</td>
                      <td className={`r ${bad ? 'tone-signal' : ''}`}>{l.status}</td><td className="r">{l.ms} ms</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="block">
        <SectionHead title="This interface" note="Build-time settings of the browser app. Server secrets are never sent to it." />
        <dl className="cfg">
          <div><dt>API base</dt><dd className="mono">{API_BASE}</dd></div>
          <div><dt>Set with</dt><dd className="mono">VITE_API_BASE in frontend/.env</dd></div>
          <div><dt>Live polling</dt><dd className="mono">Every 2 s, 8 s for slow data, paused in hidden tabs</dd></div>
          <div><dt>Build</dt><dd className="mono">{import.meta.env.MODE}</dd></div>
        </dl>
      </section>
    </>
  );
}

function Architecture({ services }: { services: Service[] }) {
  const by = Object.fromEntries(services.map((s) => [s.id, s])) as Record<string, Service>;
  const cls = (id: string) => `arch-node arch-${by[id]?.tone ?? 'wait'}`;
  const node = (id: string, x: number, y: number, w: number, label: string, sub: string) => (
    <g className={cls(id)} transform={`translate(${x} ${y})`}>
      <rect width={w} height={54} />
      <text x={14} y={23} className="arch-t">{label}</text>
      <text x={14} y={40} className="arch-s">{sub}</text>
      <circle cx={w - 14} cy={14} r={4} className="arch-led" />
    </g>
  );
  return (
    <figure className="arch">
      <svg viewBox="0 0 880 300" role="img" aria-label="Architecture: the browser app talks to the API server, which uses the simulation engine, the vector store with its embedding model, and an optional language model.">
        <g className="arch-wire" fill="none">
          <path d="M190 150H300" />
          <path d="M470 150H520V50H600" />
          <path d="M470 150H600" />
          <path d="M470 150H520V250H600" />
          <path d="M760 150H780" strokeDasharray="3 4" />
        </g>
        <g className="arch-node arch-up" transform="translate(20 123)"><rect width="170" height="54" /><text x="14" y="23" className="arch-t">Browser app</text><text x="14" y="40" className="arch-s">React and Vite</text></g>
        {node('api', 300, 123, 170, 'API server', '/api routes')}
        {node('sim', 600, 23, 200, 'Simulation engine', 'Machines, faults, incidents')}
        {node('vec', 600, 123, 200, 'Vector store', 'Passages and sources')}
        {node('llm', 600, 223, 200, 'Language model', 'Optional answers')}
        <text x="245" y="140" textAnchor="middle" className="arch-lbl">HTTP, JSON</text>
        <text x="530" y="198" className="arch-lbl">Retrieval feeds the answer</text>
      </svg>
      <figcaption className="arch-key">
        <span className="arch-k arch-k-up">Up</span><span className="arch-k arch-k-off">Not configured</span><span className="arch-k arch-k-down">Unreachable</span>
      </figcaption>
    </figure>
  );
}
