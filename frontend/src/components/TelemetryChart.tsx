import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { clock, fix } from '../lib/format';
import { prefersReducedMotion } from '../lib/motion';
import { sampleInterval, type MetricDef } from '../lib/thresholds';
import type { Machine, Sample } from '../lib/types';

const CAP = 120; // the backend keeps 120 samples per machine
const M = { l: 42, r: 54, t: 12, b: 24 };

function niceStep(range: number, target = 4) {
  const raw = range / target;
  const pow = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

function relLabel(sec: number) {
  const total = Math.round(sec);
  if (total < 1) return 'now';
  return `−${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

interface Props {
  samples: Sample[];
  metric: MetricDef;
  machine: Machine;
  height?: number;
  /** Hide the heading row (when the parent already names the chart). */
  bare?: boolean;
}

export function TelemetryChart({ samples, metric, machine, height = 190, bare = false }: Props) {
  const uid = useId().replace(/:/g, '');
  const wrapRef = useRef<HTMLDivElement>(null);
  const slideRef = useRef<SVGGElement>(null);
  const [width, setWidth] = useState(560);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = useMemo(() => samples.map((s) => s[metric.key]), [samples, metric.key]);
  const baseline = metric.baseline?.(machine);
  const warnAbove = metric.warnAbove?.(machine);
  const warnBelow = metric.warnBelow?.(machine);
  const interval = useMemo(() => sampleInterval(samples), [samples]);

  const plotW = width - M.l - M.r;
  const plotH = height - M.t - M.b;
  const step = plotW / (CAP - 1);

  const dom = useMemo(() => {
    if (metric.key === 'health') return { lo: 0, hi: 100, ticks: [0, 25, 50, 75, 100] };
    const pts = [...values, ...[baseline, warnAbove, warnBelow].filter((v): v is number => v != null)];
    let lo = Math.min(...pts), hi = Math.max(...pts);
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
    // Do not let sensor noise fill the whole plot: keep at least ~25% of the baseline as visible span.
    const minSpan = Math.abs(baseline ?? (hi + lo) / 2) * 0.25;
    if (hi - lo < minSpan) { const mid = (hi + lo) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
    const pad = (hi - lo) * 0.1;
    lo -= pad; hi += pad;
    if (metric.key !== 'temperature') lo = Math.max(0, lo);
    const s = niceStep(hi - lo);
    const start = Math.floor(lo / s) * s, end = Math.ceil(hi / s) * s;
    const ticks: number[] = [];
    for (let v = start; v <= end + s / 2; v += s) ticks.push(+v.toFixed(6));
    return { lo: start, hi: end, ticks };
  }, [values, baseline, warnAbove, warnBelow, metric.key]);

  const yOf = useCallback((v: number) => M.t + plotH - ((v - dom.lo) / (dom.hi - dom.lo)) * plotH, [dom, plotH]);
  const xOf = useCallback((i: number) => M.l + plotW - (values.length - 1 - i) * step, [plotW, values.length, step]);

  const path = useMemo(() => values.map((v, i) => `${i ? 'L' : 'M'}${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`).join(''), [values, xOf, yOf]);
  const area = values.length > 1 ? `${path}L${xOf(values.length - 1).toFixed(1)} ${yOf(dom.lo)}L${xOf(0).toFixed(1)} ${yOf(dom.lo)}Z` : '';

  // Slide the trace left by the number of samples that arrived since the last render.
  const prevLast = useRef<string | null>(null);
  useLayoutEffect(() => {
    const last = samples.length ? samples[samples.length - 1].timestamp : null;
    const prev = prevLast.current;
    prevLast.current = last;
    if (!last || !prev || prev === last || prefersReducedMotion() || !slideRef.current) return;
    let k = 0;
    for (let i = samples.length - 1; i >= 0; i--) { if (samples[i].timestamp === prev) { k = samples.length - 1 - i; break; } }
    if (k > 0 && k < 6) slideRef.current.animate([{ transform: `translateX(${k * step}px)` }, { transform: 'translateX(0)' }], { duration: 420, easing: 'cubic-bezier(.2,.7,.1,1)' });
  }, [samples, step]);

  const idxFromX = (clientX: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const rel = clientX - rect.left - M.l - (plotW - (values.length - 1) * step);
    return Math.max(0, Math.min(values.length - 1, Math.round(rel / step)));
  };

  const hv = hover != null && hover < values.length ? hover : null;
  const last = values.length ? values[values.length - 1] : null;
  const breach = (v: number) => (warnAbove != null && v > warnAbove) || (warnBelow != null && v < warnBelow);
  const warnY = warnAbove != null ? yOf(warnAbove) : null;
  const warnBY = warnBelow != null ? yOf(warnBelow) : null;
  const dev = last != null && baseline != null && metric.key !== 'health' ? last - baseline : null;

  const summary = last == null ? `${metric.label}: no samples yet` : `${metric.label} for ${machine.name}: latest ${fix(last, metric.digits)} ${metric.unit}${baseline != null && metric.key !== 'health' ? `, baseline ${fix(baseline, metric.digits)}` : ''}${warnAbove != null ? `, limit ${fix(warnAbove, metric.digits)}` : ''}. Use left and right arrow keys to read individual samples.`;

  const xTicks = [0, 0.25, 0.5, 0.75, 1];
  const span = (CAP - 1) * interval;

  const onKey = (e: React.KeyboardEvent) => {
    if (!values.length) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); setHover((h) => Math.max(0, (h ?? values.length - 1) - 1)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); setHover((h) => Math.min(values.length - 1, (h ?? values.length - 1) + 1)); }
    else if (e.key === 'Escape') setHover(null);
  };

  const tipX = hv != null ? xOf(hv) : 0;
  const tipLeft = tipX > width * 0.62;

  return (
    <div className={`chart ${bare ? 'chart-bare' : ''}`}>
      {!bare && (
        <div className="chart-head">
          <span className="chart-title">{metric.label}</span>
          <span className="chart-now mono">
            {last == null ? '–' : fix(last, metric.digits)} <small>{metric.unit}</small>
          </span>
          {dev != null && (
            <span className={`chart-dev mono ${breach(last!) ? 'is-breach' : ''}`}>
              {dev >= 0 ? '+' : '−'}{fix(Math.abs(dev), metric.digits)} vs baseline
            </span>
          )}
        </div>
      )}
      <div
        ref={wrapRef}
        className="chart-body"
        style={{ height }}
        tabIndex={0}
        role="img"
        aria-label={summary}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
        onPointerMove={(e) => values.length && setHover(idxFromX(e.clientX))}
        onPointerLeave={() => setHover(null)}
      >
        {values.length < 2 ? (
          <div className="chart-wait mono">Waiting for samples…</div>
        ) : (
          <svg width={width} height={height} aria-hidden="true">
            <defs>
              <clipPath id={`plot-${uid}`}><rect x={M.l} y={M.t - 4} width={plotW + 6} height={plotH + 8} /></clipPath>
              {warnY != null && <clipPath id={`hi-${uid}`}><rect x={0} y={0} width={width} height={warnY} /></clipPath>}
              {warnY != null && <clipPath id={`lo-${uid}`}><rect x={0} y={warnY} width={width} height={height} /></clipPath>}
              {warnBY != null && <clipPath id={`hi2-${uid}`}><rect x={0} y={0} width={width} height={warnBY} /></clipPath>}
              {warnBY != null && <clipPath id={`lo2-${uid}`}><rect x={0} y={warnBY} width={width} height={height} /></clipPath>}
              <pattern id={`hatch-${uid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" className="chart-hatch" /></pattern>
            </defs>

            {dom.ticks.map((t) => (
              <g key={t}>
                <line className="chart-grid" x1={M.l} x2={M.l + plotW} y1={yOf(t)} y2={yOf(t)} />
                <text className="chart-tick" x={M.l - 8} y={yOf(t)} textAnchor="end" dominantBaseline="central">{fix(t, t % 1 ? 1 : 0)}</text>
              </g>
            ))}

            {/* region older than the first sample we hold */}
            {values.length < CAP && <rect x={M.l} y={M.t} width={Math.max(0, xOf(0) - M.l)} height={plotH} fill={`url(#hatch-${uid})`} />}

            {xTicks.map((f) => {
              const sec = span * (1 - f);
              return <text key={f} className="chart-tick" x={M.l + plotW * f} y={height - 6} textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}>{relLabel(sec)}</text>;
            })}

            <g clipPath={`url(#plot-${uid})`}>
              <g ref={slideRef}>
                <path className="chart-area" d={area} />
                {warnY != null ? (
                  <>
                    <path className="chart-line" d={path} clipPath={`url(#lo-${uid})`} />
                    <path className="chart-line is-breach" d={path} clipPath={`url(#hi-${uid})`} />
                  </>
                ) : warnBY != null ? (
                  <>
                    <path className="chart-line" d={path} clipPath={`url(#hi2-${uid})`} />
                    <path className="chart-line is-breach" d={path} clipPath={`url(#lo2-${uid})`} />
                  </>
                ) : (
                  <path className="chart-line" d={path} />
                )}
                <circle className="chart-end-ring" cx={xOf(values.length - 1)} cy={yOf(values[values.length - 1])} r="6.5" />
                <circle className={`chart-end ${breach(values[values.length - 1]) ? 'is-breach' : ''}`} cx={xOf(values.length - 1)} cy={yOf(values[values.length - 1])} r="4.5" />
              </g>
            </g>

            {baseline != null && metric.key !== 'health' && (
              <g>
                <line className="chart-base" x1={M.l} x2={M.l + plotW} y1={yOf(baseline)} y2={yOf(baseline)} />
                {(warnY == null || Math.abs(yOf(baseline) - warnY) > 13) && <text className="chart-ref" x={M.l + plotW + 6} y={yOf(baseline)} dominantBaseline="central">base {fix(baseline, metric.digits === 2 ? 1 : 0)}</text>}
              </g>
            )}
            {warnAbove != null && (
              <g>
                <line className="chart-limit" x1={M.l} x2={M.l + plotW} y1={yOf(warnAbove)} y2={yOf(warnAbove)} />
                <text className="chart-ref is-limit" x={M.l + plotW + 6} y={yOf(warnAbove)} dominantBaseline="central">limit {fix(warnAbove, warnAbove % 1 ? 1 : 0)}</text>
              </g>
            )}
            {warnBelow != null && (
              <g>
                <line className="chart-limit" x1={M.l} x2={M.l + plotW} y1={yOf(warnBelow)} y2={yOf(warnBelow)} />
                <text className="chart-ref is-limit" x={M.l + plotW + 6} y={yOf(warnBelow)} dominantBaseline="central">warn {warnBelow}</text>
              </g>
            )}

            {hv != null && (
              <g className="chart-cross">
                <line x1={tipX} x2={tipX} y1={M.t} y2={M.t + plotH} />
                <circle cx={tipX} cy={yOf(values[hv])} r="6.5" className="chart-end-ring" />
                <circle cx={tipX} cy={yOf(values[hv])} r="4.5" className="chart-hover-dot" />
              </g>
            )}
          </svg>
        )}
        {hv != null && (
          <div className="chart-tip" style={{ left: tipLeft ? undefined : tipX + 12, right: tipLeft ? width - tipX + 12 : undefined, top: M.t }}>
            <b className="mono">{fix(values[hv], metric.digits)} <small>{metric.unit}</small></b>
            <span className="mono">{clock(samples[hv].timestamp)}</span>
            {baseline != null && metric.key !== 'health' && <span className="mono">{values[hv] - baseline >= 0 ? '+' : '−'}{fix(Math.abs(values[hv] - baseline), metric.digits)} vs baseline</span>}
            {breach(values[hv]) && <span className="chart-tip-flag">Beyond limit</span>}
          </div>
        )}
      </div>
    </div>
  );
}
