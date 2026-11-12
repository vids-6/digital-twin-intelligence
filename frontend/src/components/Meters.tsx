import { useMemo } from 'react';
import { clamp } from '../lib/format';
import type { MachineStatus } from '../lib/types';

/** A row of thin vertical ticks, like a bargraph on a panel meter. Neutral when healthy, red when degraded. */
export function HealthTicks({ value, count = 24, status, label }: { value: number; count?: number; status?: MachineStatus; label?: string }) {
  const filled = Math.round((clamp(value, 0, 100) / 100) * count);
  const tone = status === 'critical' || value < 40 ? 'crit' : status === 'warning' || value < 75 ? 'warn' : 'ok';
  return (
    <div className={`ticks ticks-${tone}`} role="img" aria-label={label ?? `Health ${Math.round(value)} percent`} style={{ ['--n' as string]: count }}>
      {Array.from({ length: count }, (_, i) => (
        <i key={i} className={i < filled ? 'on' : ''} />
      ))}
    </div>
  );
}

interface SparkProps {
  values: number[];
  width?: number;
  height?: number;
  /** Include these in the y-range so a baseline/limit never sits outside the plot. */
  include?: number[];
  /** Minimum value span of the y-axis, so tiny noise is not stretched to fill the plot. */
  minSpan?: number;
  tone?: 'cobalt' | 'neutral' | 'signal';
  className?: string;
  label?: string;
}

export function Sparkline({ values, width = 96, height = 28, include = [], minSpan = 0, tone = 'cobalt', className = '', label }: SparkProps) {
  const geo = useMemo(() => {
    if (values.length < 2) return null;
    const all = [...values, ...include];
    let lo = Math.min(...all), hi = Math.max(...all);
    if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
    if (hi - lo < minSpan) { const mid = (hi + lo) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
    const pad = 3;
    const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = (v: number) => height - pad - ((v - lo) / (hi - lo)) * (height - pad * 2);
    const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
    return { d, ex: x(values.length - 1), ey: y(values[values.length - 1]), by: include.map(y) };
  }, [values, include, minSpan, width, height]);

  return (
    <svg className={`spark spark-${tone} ${className}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? 'Trend'}>
      {geo ? (
        <>
          {geo.by.map((y, i) => <line key={i} className="spark-ref" x1="0" x2={width} y1={y} y2={y} />)}
          <path className="spark-line" d={geo.d} />
          <circle className="spark-dot" cx={geo.ex} cy={geo.ey} r="2.6" />
        </>
      ) : (
        <line className="spark-ref" x1="0" x2={width} y1={height / 2} y2={height / 2} />
      )}
    </svg>
  );
}

/** Horizontal value bar used for scores (0..1). */
export function ScoreBar({ value, max = 1, tone = 'cobalt', label }: { value: number; max?: number; tone?: 'cobalt' | 'acid' | 'paper' | 'signal'; label?: string }) {
  return (
    <span className={`scorebar scorebar-${tone}`} role="img" aria-label={label ?? `${value.toFixed(3)} of ${max}`}>
      <i style={{ width: `${clamp(value / max, 0, 1) * 100}%` }} />
    </span>
  );
}
