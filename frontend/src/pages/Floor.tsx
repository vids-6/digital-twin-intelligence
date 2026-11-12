import { useEffect, useMemo, useRef, useState } from 'react';
import { BrainCircuit, RotateCcw, TriangleAlert } from 'lucide-react';
import { MachinePictogram, StatusGlyph, StatusTag } from '../components/Glyphs';
import { Menu } from '../components/Menu';
import { Sparkline } from '../components/Meters';
import { PageHead } from '../components/PageHead';
import { fix, int, sentence } from '../lib/format';
import { useReducedMotion } from '../lib/motion';
import { FAULTS, METRICS, series, type MetricKey } from '../lib/thresholds';
import type { Machine } from '../lib/types';
import { useFactory } from '../state/factory';

/* Schematic layout, in viewBox units (1200 x 740). Not to scale: the layout is illustrative, the data is live. */
const W = 1200, H = 740;
const CARD_W = 210, CARD_H = 150;
const BELT_Y1 = 250, BELT_Y2 = 520;
const SLOTS = [
  { x: 300, y: BELT_Y1, side: 'top' as const, hub: 540 },
  { x: 600, y: BELT_Y1, side: 'top' as const, hub: 600 },
  { x: 900, y: BELT_Y1, side: 'top' as const, hub: 660 },
  { x: 800, y: BELT_Y2, side: 'bottom' as const, hub: 640 },
  { x: 400, y: BELT_Y2, side: 'bottom' as const, hub: 560 },
];
const HUB = { x: 490, y: 343, w: 220, h: 84 };
// ordered points along the belt: entry, station 1-3, corner, corner, station 4-5, exit
const BELT_PTS: [number, number][] = [[60, BELT_Y1], [300, BELT_Y1], [600, BELT_Y1], [900, BELT_Y1], [1080, BELT_Y1], [1080, BELT_Y2], [800, BELT_Y2], [400, BELT_Y2], [120, BELT_Y2]];
const STATION_PT_INDEX = [1, 2, 3, 6, 7];
const toPath = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('');
const BELT_PATH = toPath(BELT_PTS);

const cardOrigin = (i: number) => {
  const s = SLOTS[i];
  return { x: s.x - CARD_W / 2, y: s.side === 'top' ? s.y - 26 - CARD_H : s.y + 26 };
};
const linkPath = (i: number) => {
  const s = SLOTS[i];
  if (s.side === 'top') return `M${s.hub} ${HUB.y}V300H${s.x}V${s.y - 26}`;
  return `M${s.hub} ${HUB.y + HUB.h}V470H${s.x}V${s.y + 26}`;
};

function Brackets({ x, y, w, h, len = 16 }: { x: number; y: number; w: number; h: number; len?: number }) {
  const d = `M${x - 6} ${y - 6 + len}V${y - 6}H${x - 6 + len}M${x + w + 6 - len} ${y - 6}H${x + w + 6}V${y - 6 + len}M${x + w + 6} ${y + h + 6 - len}V${y + h + 6}H${x + w + 6 - len}M${x - 6 + len} ${y + h + 6}H${x - 6}V${y + h + 6 - len}`;
  return <path className="fl-brackets" d={d} />;
}

export function Floor() {
  const { machines, incidents, telemetry, selected, selectedId, select, act, busy, overview } = useFactory();
  const [layers, setLayers] = useState({ telemetry: true, exposure: true });
  const [fault, setFault] = useState('high_vibration');
  const reduced = useReducedMotion();
  const svgRef = useRef<SVGSVGElement>(null);
  const running = overview?.running ?? false;
  const ordered = useMemo(() => [...machines].sort((a, b) => a.position - b.position), [machines]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (running && !reduced) svg.unpauseAnimations();
    else svg.pauseAnimations();
  }, [running, reduced, ordered.length]);

  const active = incidents.filter((i) => i.status === 'active');
  const firstHit = active.length ? Math.min(...active.map((i) => ordered.find((m) => m.id === i.machine_id)?.position ?? 99)) : null;
  const exposed = firstHit != null && firstHit < ordered.length - 1 ? ordered.filter((m) => m.position > firstHit) : [];
  const exposurePath = firstHit != null && firstHit < SLOTS.length ? toPath(BELT_PTS.slice(STATION_PT_INDEX[firstHit])) : null;
  const faultDef = FAULTS.find((f) => f.value === fault)!;

  return (
    <>
      <PageHead
        title="Floor"
        lead="A schematic of the line. Statuses, readings and incidents are live; positions are illustrative and not to scale."
        spec={[
          { k: 'Layout', v: 'U-line, 5 stations' },
          { k: 'Material flow', v: 'M-01 to M-05' },
          { k: 'Telemetry', v: 'Polled every 2 s' },
          { k: 'Active incidents', v: active.length, tone: active.length ? 'signal' : undefined },
        ]}
      />

      <div className="floor-grid">
        <section className="floor-main" aria-label="Factory floor schematic">
          <div className="floor-bar">
            <fieldset className="layers">
              <legend className="sr-only">Layers</legend>
              <label className="toggle"><input type="checkbox" checked={layers.telemetry} onChange={(e) => setLayers((l) => ({ ...l, telemetry: e.target.checked }))} /><span className="toggle-box" />Telemetry links</label>
              <label className="toggle"><input type="checkbox" checked={layers.exposure} onChange={(e) => setLayers((l) => ({ ...l, exposure: e.target.checked }))} /><span className="toggle-box" />Downstream exposure</label>
            </fieldset>
            <ul className="legend" aria-label="Legend">
              {(['running', 'warning', 'critical', 'paused'] as const).map((s) => <li key={s}><StatusGlyph status={s} /> {sentence(s)}</li>)}
            </ul>
          </div>

          <div className="floor-scroll">
            <svg ref={svgRef} className="floor" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Line schematic with five machines">
              <defs>
                <pattern id="fl-dots" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" className="fl-dot" /></pattern>
                <pattern id="fl-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" className="fl-hatchline" /></pattern>
              </defs>
              <rect className="fl-floor" x="20" y="20" width={W - 40} height={H - 40} />
              <rect x="20" y="20" width={W - 40} height={H - 40} fill="url(#fl-dots)" />
              <text className="fl-zone" x="40" y="52">Zone A</text>
              <text className="fl-zone fl-zone-r" x={W - 40} y="52" textAnchor="end">Schematic, not to scale</text>
              <text className="fl-io" x="64" y={BELT_Y1 - 22}>In</text>
              <text className="fl-io" x="124" y={BELT_Y2 + 36} textAnchor="start">Out</text>

              {/* belt */}
              <path className="fl-belt-body" d={BELT_PATH} />
              <path className="fl-belt-inner" d={BELT_PATH} />
              <path className={`fl-belt-flow ${running ? 'is-running' : ''}`} d={BELT_PATH} />

              {layers.exposure && exposurePath && <path className="fl-exposure" d={exposurePath} />}

              {/* telemetry links */}
              {layers.telemetry && (
                <g className="fl-links">
                  {ordered.map((m) => <path key={m.id} className="fl-link" d={linkPath(m.position)} />)}
                  {!reduced && ordered.map((m) => (
                    <circle key={`${m.id}-${m.last_updated}`} className="fl-pulse" r="4.5">
                      <animateMotion dur="0.9s" begin="0s" fill="freeze" path={linkPath(m.position)} keyPoints="1;0" keyTimes="0;1" calcMode="linear" />
                      <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.75;1" dur="0.9s" begin="0s" fill="freeze" />
                    </circle>
                  ))}
                </g>
              )}

              {/* material crates */}
              {running && !reduced && (
                <g className="fl-crates">
                  {[0, 1, 2, 3, 4, 5].map((k) => (
                    <rect key={k} className="fl-crate" x="-6" y="-6" width="12" height="12">
                      <animateMotion dur="30s" repeatCount="indefinite" begin={`-${k * 5}s`} path={BELT_PATH} />
                    </rect>
                  ))}
                </g>
              )}

              {/* twin core */}
              <g className="fl-hub">
                <rect x={HUB.x} y={HUB.y} width={HUB.w} height={HUB.h} className="fl-hub-box" />
                <text x={HUB.x + 16} y={HUB.y + 34} className="fl-hub-title">Twin core</text>
                <text x={HUB.x + 16} y={HUB.y + 60} className="fl-hub-sub">API · {ordered.length} streams in</text>
              </g>

              {/* stations */}
              {ordered.map((m) => (
                <Station key={m.id} m={m} selected={selectedId === m.id} exposed={layers.exposure && exposed.some((e) => e.id === m.id)} onSelect={() => select(m.id)} />
              ))}
            </svg>
          </div>
          <p className="floor-note">
            {exposed.length > 0 && layers.exposure
              ? `Shaded belt: stages downstream of ${ordered[firstHit!].id} that a line stoppage could reach. This is potential exposure only; the simulation does not model blockages.`
              : 'The moving belt and crates show the line is running. Each dot travelling to the twin core is one new telemetry sample arriving from the API.'}
          </p>
        </section>

        {selected && (
          <Inspector
            m={selected}
            samples={telemetry[selected.id]}
            fault={fault}
            setFault={setFault}
            faultHint={faultDef.hint}
            busy={busy}
            onInject={() => act('/simulation/trigger', { machine_id: selected.id, fault }, `${faultDef.label} injected on ${selected.id}`)}
            onReset={() => act(`/machines/${selected.id}/reset`, undefined, `${selected.id} reset to baseline`)}
          />
        )}
      </div>
    </>
  );
}

function Station({ m, selected, exposed, onSelect }: { m: Machine; selected: boolean; exposed: boolean; onSelect: () => void }) {
  const { x, y } = cardOrigin(m.position);
  const hot = m.status === 'warning' || m.status === 'critical';
  const key = (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } };
  return (
    <g className={`fl-station st-${m.status} ${selected ? 'is-selected' : ''} ${exposed ? 'is-exposed' : ''}`} role="button" tabIndex={0} aria-pressed={selected} aria-label={`${m.id} ${m.name}, ${m.status}, health ${Math.round(m.health)} percent, ${m.temperature.toFixed(1)} degrees`} onClick={onSelect} onKeyDown={key}>
      <rect className="fl-card" x={x} y={y} width={CARD_W} height={CARD_H} />
      {m.status === 'warning' && <rect x={x} y={y} width={CARD_W} height={CARD_H} fill="url(#fl-hatch)" pointerEvents="none" />}
      {selected && <Brackets x={x} y={y} w={CARD_W} h={CARD_H} />}
      <text className="fl-id" x={x + 14} y={y + 26}>{m.id}</text>
      <g transform={`translate(${x + CARD_W - 28} ${y + 13})`}><StatusGlyph status={m.status} size={14} /></g>
      <MachinePictogram id={m.id} className="fl-picto" x={x + 12} y={y + 38} width={104} height={62} />
      <text className="fl-health" x={x + CARD_W - 14} y={y + 84} textAnchor="end">{Math.round(m.health)}<tspan className="fl-pct">%</tspan></text>
      <text className="fl-label" x={x + CARD_W - 14} y={y + 100} textAnchor="end">health</text>
      <text className="fl-name" x={x + 14} y={y + 122}>{m.name}</text>
      <text className="fl-read" x={x + 14} y={y + 141}>{fix(m.temperature, 1)} °C · {fix(m.vibration, 2)} mm/s</text>
      {exposed && !hot && <text className="fl-exp" x={x + CARD_W - 14} y={y + 26} textAnchor="end" dx="-20">exposed</text>}
    </g>
  );
}

function Inspector({ m, samples, fault, setFault, faultHint, busy, onInject, onReset }: {
  m: Machine; samples: ReturnType<typeof useFactory>['telemetry'][string]; fault: string; setFault: (v: string) => void; faultHint: string; busy: boolean; onInject: () => void; onReset: () => void;
}) {
  const rows: { key: MetricKey; value: string }[] = [
    { key: 'temperature', value: fix(m.temperature, 1) },
    { key: 'vibration', value: fix(m.vibration, 2) },
    { key: 'pressure', value: fix(m.pressure, 2) },
    { key: 'power_kw', value: fix(m.power_kw, 1) },
    { key: 'health', value: fix(m.health, 0) },
  ];
  return (
    <aside className="inspector" aria-label={`Inspector for ${m.name}`}>
      <div className="insp-top">
        <span className="mono insp-id">{m.id}</span>
        <StatusTag status={m.status} />
      </div>
      <h2 className="insp-name">{m.name}</h2>
      <p className="insp-type">{m.type} · stage {m.position + 1} of 5</p>
      {m.fault && (
        <p className="insp-fault"><TriangleAlert size={15} /> Active fault: {sentence(m.fault)}</p>
      )}

      <dl className="insp-reads">
        {rows.map((r) => {
          const def = METRICS[r.key];
          const over = def.warnAbove && m[r.key === 'power_kw' ? 'power_kw' : r.key] > def.warnAbove(m);
          return (
            <div key={r.key}>
              <dt>{def.label}</dt>
              <dd className={`mono ${over ? 'is-over' : ''}`}>{r.value}<small>{def.unit}</small></dd>
              <Sparkline values={series(samples, r.key)} minSpan={r.key === 'health' ? 30 : Math.max(0.5, (def.baseline?.(m) ?? 1) * 0.3)} include={[def.baseline?.(m) ?? NaN, ...(def.warnAbove ? [def.warnAbove(m)] : [])].filter((v) => !Number.isNaN(v))} width={84} height={24} tone={over ? 'signal' : 'cobalt'} label={`${def.label} trend`} />
            </div>
          );
        })}
        <div><dt>Output</dt><dd className="mono">{int(m.production_count)}<small>units</small></dd><span /></div>
      </dl>

      <div className="insp-block">
        <h3>Inject a fault</h3>
        <p className="insp-help">Adds a simulated fault to {m.id} and raises an incident.</p>
        <Menu value={fault} onChange={setFault} ariaLabel="Fault type" options={FAULTS.map((f) => ({ value: f.value, label: f.label, hint: f.hint }))} className="menu-block" />
        <p className="insp-help">{faultHint}</p>
        <button className="btn btn-danger btn-block" onClick={onInject} disabled={busy}>Inject on {m.id}</button>
      </div>

      <div className="insp-actions">
        <a className="btn" href={`#/investigate?m=${m.id}`}><BrainCircuit size={15} /> Investigate</a>
        <button className="btn" onClick={onReset} disabled={busy}><RotateCcw size={15} /> Reset {m.id}</button>
        <a className="link insp-more" href={`#/machines/${m.id}`}>Full detail and history</a>
      </div>
    </aside>
  );
}
