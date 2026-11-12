import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Pause, Play, RotateCcw } from 'lucide-react';
import { MachinePictogram, StatusGlyph, StatusTag } from '../components/Glyphs';
import { HealthTicks, Sparkline } from '../components/Meters';
import { SectionHead } from '../components/PageHead';
import { TelemetryChart } from '../components/TelemetryChart';
import { EmptyState } from '../components/States';
import { ago, clock, duration, fix, int, sentence } from '../lib/format';
import { useNow, useTween } from '../lib/motion';
import { METRICS, series, sampleInterval } from '../lib/thresholds';
import { useFactory } from '../state/factory';

let booted = false; // the power-up sequence plays once per page load

export function Command() {
  const { overview, machines, incidents, telemetry, selected, selectedId, select, act, busy } = useFactory();
  const now = useNow(1000);
  const [boot] = useState(() => !booted);
  useEffect(() => { booted = true; }, []);

  const health = useTween(overview?.average_health ?? 0, 700);
  const totalKw = machines.reduce((s, m) => s + m.power_kw, 0);
  const paused = machines.filter((m) => m.status === 'paused').length;
  const weakest = useMemo(() => [...machines].sort((a, b) => a.health - b.health)[0], [machines]);
  const needs = (overview?.active_incidents ?? 0) > 0;
  const samples = selected ? telemetry[selected.id] : undefined;
  const interval = samples ? sampleInterval(samples) : 2;
  const running = overview?.running ?? false;

  return (
    <>
      <section className="cmd-hero">
        <div className="cmd-hero-main">
          <h1 className="pagehead-title pagehead-xl-title">Command</h1>
          <p className="pagehead-lead">
            Live state of the {machines.length}-machine line at {overview?.factory_name ?? 'the plant'}. Readings refresh every two seconds from the simulation engine.
          </p>
          <div className="pagehead-actions">
            {running ? (
              <button className="btn btn-primary" onClick={() => act('/simulation/pause', undefined, 'Simulation paused')} disabled={busy}><Pause size={15} /> Pause simulation</button>
            ) : (
              <button className="btn btn-primary" onClick={() => act('/simulation/start', undefined, 'Simulation running')} disabled={busy}><Play size={15} /> Resume simulation</button>
            )}
            <button className="btn" onClick={() => act('/simulation/reset', undefined, 'Factory reset')} disabled={busy}><RotateCcw size={15} /> Reset factory</button>
          </div>
          <dl className="figures">
            <div className="figure"><dt>Units produced this run</dt><dd className="display">{int(overview?.production_count ?? 0)}</dd></div>
            <div className="figure"><dt>Combined power draw</dt><dd className="display">{fix(totalKw, 1)}<small>kW</small></dd></div>
            <div className="figure"><dt>Simulation uptime</dt><dd className="display">{duration(overview?.uptime_seconds ?? 0)}</dd></div>
          </dl>
        </div>

        <aside className="sheet health-sheet reg" aria-label="Factory health">
          <div className="health-top">
            <h2>Factory health</h2>
            <span className="mono">average of {machines.length} machines</span>
          </div>
          <div className="health-num" role="img" aria-label={`Average health ${overview?.average_health ?? 0} percent`}>
            <span className="display">{Math.round(health)}</span><small className="display">%</small>
          </div>
          <HealthTicks value={overview?.average_health ?? 0} count={40} status={needs ? 'warning' : 'running'} />
          <dl className="health-counts">
            {([['running', overview?.running_count ?? 0], ['warning', overview?.warning_count ?? 0], ['critical', overview?.critical_count ?? 0], ['paused', paused]] as const).map(([s, n]) => (
              <div key={s} className={n && (s === 'warning' || s === 'critical') ? 'is-hot' : ''}>
                <dt><StatusGlyph status={s} /> {sentence(s)}</dt>
                <dd className="mono">{n}</dd>
              </div>
            ))}
          </dl>
          {weakest && (
            <p className="health-note">
              {weakest.health >= 99.5 ? (
                'Every machine is at full health.'
              ) : (
                <>Lowest: <a className="link" href={`#/machines/${weakest.id}`}>{weakest.id} {weakest.name}</a> at <b className="mono">{Math.round(weakest.health)}%</b></>
              )}
            </p>
          )}
        </aside>
      </section>

      <section className="block" aria-labelledby="line-h">
        <SectionHead
          title="Production line"
          note="Material moves left to right, M-01 to M-05. Pick a station to chart it below."
          right={<a className="btn btn-sm" href="#/floor">Open floor plan <ArrowUpRight size={14} /></a>}
        />
        <div className={`line ${boot ? 'is-booting' : ''} ${running ? 'is-running' : ''}`}>
          <div className="line-belt" aria-hidden="true"><i /></div>
          <ol className="stations">
            {machines.map((m, i) => {
              const t = telemetry[m.id];
              const tempSpark = series(t, 'temperature');
              const vibSpark = series(t, 'vibration');
              const kwSpark = series(t, 'power_kw');
              return (
                <li key={m.id} className={`station st-${m.status} ${selectedId === m.id ? 'is-selected' : ''}`} style={{ ['--i' as string]: i }}>
                  <div className="station-top">
                    <span className="mono station-id">{m.id}</span>
                    <StatusTag status={m.status} />
                  </div>
                  <button className="station-pick" onClick={() => select(m.id)} aria-pressed={selectedId === m.id} aria-label={`Chart ${m.name}`}>
                    <MachinePictogram id={m.id} className="station-picto" />
                    <span className="station-name">{m.name}</span>
                    <span className="station-type">{m.type}</span>
                  </button>
                  <div className="station-health">
                    <span>Health</span><b className="mono">{Math.round(m.health)}%</b>
                  </div>
                  <HealthTicks value={m.health} status={m.status} count={20} />
                  <dl className="reads">
                    <div><dt>Temp</dt><dd className="mono">{fix(m.temperature, 1)}<small>°C</small></dd><Sparkline values={tempSpark} include={[m.base_temp * 1.25]} minSpan={m.base_temp * 0.25} width={64} height={22} tone={m.temperature > m.base_temp * 1.25 ? 'signal' : 'cobalt'} label={`${m.name} temperature trend`} /></div>
                    <div><dt>Vib</dt><dd className="mono">{fix(m.vibration, 2)}<small>mm/s</small></dd><Sparkline values={vibSpark} include={[5]} minSpan={2} width={64} height={22} tone={m.vibration > 5 ? 'signal' : 'cobalt'} label={`${m.name} vibration trend`} /></div>
                    <div><dt>Power</dt><dd className="mono">{fix(m.power_kw, 1)}<small>kW</small></dd><Sparkline values={kwSpark} minSpan={m.power * 0.3} width={64} height={22} label={`${m.name} power trend`} /></div>
                  </dl>
                  <div className="station-foot">
                    {m.fault ? <span className="station-fault"><StatusGlyph status={m.status === 'critical' ? 'critical' : 'warning'} /> {sentence(m.fault)}</span> : <span className="muted">No fault</span>}
                    <a className="link station-more" href={`#/machines/${m.id}`} onClick={() => select(m.id)}>Details</a>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <div className="cmd-split">
        <section className="block" aria-labelledby="tele-h">
          <SectionHead
            title={selected ? `${selected.name} telemetry` : 'Telemetry'}
            note={samples ? `Last ${samples.length} samples, about ${fix(interval, 0)} s apart. Dashed line marks the engine's warning limit.` : 'Waiting for samples.'}
            right={
              <div className="seg" role="group" aria-label="Machine to chart">
                {machines.map((m) => (
                  <button key={m.id} aria-pressed={selectedId === m.id} onClick={() => select(m.id)}>
                    <StatusGlyph status={m.status} size={10} /><span className="mono">{m.id}</span>
                  </button>
                ))}
              </div>
            }
          />
          {selected && samples ? (
            <div className="chart-stack">
              <TelemetryChart samples={samples} metric={METRICS.temperature} machine={selected} />
              <TelemetryChart samples={samples} metric={METRICS.vibration} machine={selected} />
            </div>
          ) : (
            <EmptyState title="No telemetry yet" mark="chart">Samples appear here as soon as the simulation produces them.</EmptyState>
          )}
        </section>

        <section className="block ledger-block" aria-labelledby="inc-h">
          <SectionHead title="Incident ledger" note={needs ? `${overview?.active_incidents} active` : 'Nothing active'} />
          {incidents.length === 0 ? (
            <EmptyState title="The line is nominal" mark="clear" action={<a className="btn btn-sm" href="#/floor">Inject a fault on the floor</a>}>
              No incidents have been raised. Inject a fault on any machine to see how an investigation starts.
            </EmptyState>
          ) : (
            <ol className="ledger">
              {incidents.slice(0, 6).map((inc) => (
                <li key={inc.id} className={`ledger-row sev-${inc.severity}`}>
                  <div className="ledger-head">
                    <span className="mono ledger-id">{inc.id}</span>
                    <StatusTag status={inc.severity} />
                    <span className="mono ledger-time" title={clock(inc.timestamp)}>{ago(inc.timestamp, now)}</span>
                  </div>
                  <p className="ledger-title">{inc.title}</p>
                  <p className="ledger-sub">{inc.machine_name} <span className="mono">{inc.machine_id}</span></p>
                  <a className="btn btn-sm" href={`#/investigate?m=${inc.machine_id}&inc=${inc.id}`}>Investigate</a>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
