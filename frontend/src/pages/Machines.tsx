import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, RotateCcw } from 'lucide-react';
import { StatusGlyph, StatusTag } from '../components/Glyphs';
import { HealthTicks } from '../components/Meters';
import { PageHead, SectionHead } from '../components/PageHead';
import { EmptyState, Skeleton } from '../components/States';
import { TelemetryChart } from '../components/TelemetryChart';
import { ScoreBar } from '../components/Meters';
import { api } from '../lib/api';
import { ago, clock, docIdFromChunk, fix, int, sentence } from '../lib/format';
import { useNow } from '../lib/motion';
import { replaceRoute, useRoute } from '../lib/router';
import { CRIT_HEALTH, METRICS, series, stats, WARN_HEALTH, WARN_TEMP_FACTOR, WARN_VIBRATION, type MetricKey } from '../lib/thresholds';
import type { SearchHit } from '../lib/types';
import { useFactory } from '../state/factory';

const ORDER: MetricKey[] = ['temperature', 'vibration', 'pressure', 'power_kw', 'health'];

export function Machines() {
  const { segments } = useRoute();
  const { machines, telemetry, incidents, selectedId, select, act, busy } = useFactory();
  const now = useNow(1000);
  const id = segments[1];

  useEffect(() => { if (!id) replaceRoute(`/machines/${selectedId}`); }, [id, selectedId]);
  useEffect(() => { if (id && machines.some((m) => m.id === id)) select(id); }, [id, machines, select]);

  const m = machines.find((x) => x.id === id);
  const samples = m ? telemetry[m.id] : undefined;
  const sorted = useMemo(() => [...machines].sort((a, b) => a.position - b.position), [machines]);

  const [related, setRelated] = useState<{ state: 'loading' | 'ok' | 'error'; hits: SearchHit[]; error?: string }>({ state: 'loading', hits: [] });
  useEffect(() => {
    if (!m) return;
    const ctl = new AbortController();
    setRelated({ state: 'loading', hits: [] });
    api<{ results: SearchHit[] }>('/knowledge/search', { method: 'POST', body: { query: `${m.name} ${m.type} maintenance`, top_k: 3 }, signal: ctl.signal })
      .then((r) => setRelated({ state: 'ok', hits: r.results }))
      .catch((e) => e.name !== 'AbortError' && setRelated({ state: 'error', hits: [], error: e.message }));
    return () => ctl.abort();
  }, [m?.id, m?.name, m?.type]);

  if (!id) return null;
  if (!m) return <EmptyState title="Machine not found" action={<a className="btn btn-primary" href="#/machines">Back to machines</a>}>No machine has the id <span className="mono">{id}</span>.</EmptyState>;

  const mine = incidents.filter((i) => i.machine_id === m.id);
  const up = sorted.find((x) => x.position === m.position - 1);
  const down = sorted.find((x) => x.position === m.position + 1);
  const recent = (samples ?? []).slice(-20).reverse();

  return (
    <>
      <nav className="mtabs" aria-label="Machines">
        {sorted.map((x) => (
          <a key={x.id} href={`#/machines/${x.id}`} className={x.id === m.id ? 'is-active' : ''} aria-current={x.id === m.id ? 'page' : undefined}>
            <span className="mtab-top"><StatusGlyph status={x.status} /> <b className="mono">{x.id}</b></span>
            <span className="mtab-name">{x.name}</span>
          </a>
        ))}
      </nav>

      <PageHead
        title={m.name}
        lead={<>{m.type}. Stage {m.position + 1} of {machines.length} on the line{m.fault ? <> with an active <b>{sentence(m.fault)}</b> fault</> : ''}.</>}
        actions={
          <>
            <a className="btn btn-primary" href={`#/investigate?m=${m.id}`}><BrainCircuit size={15} /> Investigate</a>
            <button className="btn" onClick={() => act(`/machines/${m.id}/reset`, undefined, `${m.id} reset to baseline`)} disabled={busy}><RotateCcw size={15} /> Reset to baseline</button>
          </>
        }
        spec={[
          { k: 'Machine id', v: m.id },
          { k: 'Status', v: <StatusTag status={m.status} /> },
          { k: 'Upstream', v: up ? `${up.id} ${up.name}` : 'Line entry' },
          { k: 'Downstream', v: down ? `${down.id} ${down.name}` : 'Line exit' },
          { k: 'Last sample', v: clock(m.last_updated) },
        ]}
      />

      <section className="block" aria-label="Current readings">
        <div className="mstats">
          {ORDER.map((k) => {
            const def = METRICS[k];
            const v = series(samples, k);
            const st = stats(v);
            const now_ = m[k === 'power_kw' ? 'power_kw' : k];
            const over = (def.warnAbove && now_ > def.warnAbove(m)) || (def.warnBelow && now_ < def.warnBelow(m));
            return (
              <div key={k} className={`mstat ${over ? 'is-over' : ''}`}>
                <span className="mstat-label">{def.label}</span>
                <b className="mstat-now mono">{fix(now_, def.digits)}<small>{def.unit}</small></b>
                {k === 'health' && <HealthTicks value={m.health} status={m.status} count={20} />}
                <dl className="mstat-win">
                  <div><dt>Min</dt><dd className="mono">{st ? fix(st.min, def.digits) : '–'}</dd></div>
                  <div><dt>Mean</dt><dd className="mono">{st ? fix(st.mean, def.digits) : '–'}</dd></div>
                  <div><dt>Max</dt><dd className="mono">{st ? fix(st.max, def.digits) : '–'}</dd></div>
                </dl>
              </div>
            );
          })}
        </div>
        <p className="mstat-note">Min, mean and max cover the last {samples?.length ?? 0} samples held by the backend (about {fix(((samples?.length ?? 0) * 2) / 60, 1)} minutes). Output so far: <b className="mono">{int(m.production_count)}</b> units.</p>
      </section>

      <section className="block">
        <SectionHead title="Telemetry history" note="Solid grey line is the machine's baseline. Dashed red line is the warning limit used by the simulation engine; the trace turns red beyond it." />
        <div className="chart-grid">
          {ORDER.map((k) => <TelemetryChart key={k} samples={samples ?? []} metric={METRICS[k]} machine={m} height={170} />)}
          <div className="refcard">
            <h3>Baselines and limits</h3>
            <table className="tbl">
              <thead><tr><th>Signal</th><th className="r">Baseline</th><th className="r">Warning</th></tr></thead>
              <tbody>
                <tr><td>Temperature</td><td className="r mono">{fix(m.base_temp, 0)} °C</td><td className="r mono">&gt; {fix(m.base_temp * WARN_TEMP_FACTOR, 1)} °C</td></tr>
                <tr><td>Vibration</td><td className="r mono">{fix(m.base_vibration, 1)} mm/s</td><td className="r mono">&gt; {WARN_VIBRATION} mm/s</td></tr>
                <tr><td>Pressure</td><td className="r mono">{fix(m.base_pressure, 1)} bar</td><td className="r muted">none</td></tr>
                <tr><td>Power</td><td className="r mono">{fix(m.power, 1)} kW</td><td className="r muted">none</td></tr>
                <tr><td>Health</td><td className="r mono">100 %</td><td className="r mono">&lt; {WARN_HEALTH} % (critical &lt; {CRIT_HEALTH} %)</td></tr>
              </tbody>
            </table>
            <p className="refcard-note">These are the simulation's own parameters, not manufacturer limits. Real equipment would use its documented alarm limits.</p>
          </div>
        </div>
      </section>

      <div className="mach-split">
        <section className="block">
          <SectionHead title="Incidents on this machine" note={mine.length ? `${mine.length} recorded this run` : undefined} />
          {mine.length === 0 ? (
            <EmptyState title="No incidents" mark="clear" action={<a className="btn btn-sm" href="#/floor">Inject a fault on the floor</a>}>{m.name} has not raised an incident in this run.</EmptyState>
          ) : (
            <ol className="ledger">
              {mine.map((inc) => (
                <li key={inc.id} className={`ledger-row sev-${inc.severity}`}>
                  <div className="ledger-head"><span className="mono ledger-id">{inc.id}</span><StatusTag status={inc.severity} /><span className="mono ledger-time">{ago(inc.timestamp, now)}</span></div>
                  <p className="ledger-title">{inc.title}</p>
                  <p className="ledger-sub">{inc.description}</p>
                  <a className="btn btn-sm" href={`#/investigate?m=${m.id}&inc=${inc.id}`}>Investigate</a>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="block">
          <SectionHead title="Related maintenance documents" note="Top matches from the library for this machine's name and type." right={<a className="link" href="#/library">Open library</a>} />
          {related.state === 'loading' && <div className="rel-skel"><Skeleton h={64} /><Skeleton h={64} /><Skeleton h={64} /></div>}
          {related.state === 'error' && <EmptyState title="Could not search the library" mark="search">{related.error}</EmptyState>}
          {related.state === 'ok' && related.hits.length === 0 && <EmptyState title="Nothing indexed yet" mark="doc" action={<a className="btn btn-sm" href="#/library">Add documents</a>}>Upload maintenance documents to see matches here.</EmptyState>}
          {related.state === 'ok' && related.hits.length > 0 && (
            <ol className="rel">
              {related.hits.map((h) => (
                <li key={h.chunk_id}>
                  <div className="rel-top"><b>{h.document_name}</b><span className="mono">{h.score.toFixed(3)}</span></div>
                  <ScoreBar value={h.score} label={`Similarity ${h.score.toFixed(3)}`} />
                  <p>{h.text.slice(0, 190)}{h.text.length > 190 ? '…' : ''}</p>
                  <a className="link" href={`#/library?doc=${docIdFromChunk(h.chunk_id)}&chunk=${encodeURIComponent(h.chunk_id)}`}>Read in the library</a>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <details className="datatable">
        <summary>View the latest 20 samples as a table</summary>
        <div className="table-scroll">
          <table className="tbl">
            <thead><tr><th>Time</th><th className="r">Temp °C</th><th className="r">Vib mm/s</th><th className="r">Pressure bar</th><th className="r">Power kW</th><th className="r">Health %</th><th className="r">Output</th></tr></thead>
            <tbody>
              {recent.map((s) => (
                <tr key={s.timestamp} className="mono"><td>{clock(s.timestamp)}</td><td className="r">{fix(s.temperature, 1)}</td><td className="r">{fix(s.vibration, 2)}</td><td className="r">{fix(s.pressure, 2)}</td><td className="r">{fix(s.power_kw, 2)}</td><td className="r">{fix(s.health, 0)}</td><td className="r">{s.production_count}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
