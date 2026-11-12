import { clamp } from '../lib/format';

interface Props {
  value: number;
  baseline?: number;
  /** A limit the value must stay below (above=true) or above (above=false). */
  limit?: number;
  limitIs?: 'max' | 'min';
  max: number;
  label: string;
}

/** Bullet bar: the reading as a fill, with a tick for the baseline and a red tick for the limit. */
export function Bullet({ value, baseline, limit, limitIs = 'max', max, label }: Props) {
  const pct = (v: number) => `${clamp(v / max, 0, 1) * 100}%`;
  const beyond = limit != null && (limitIs === 'max' ? value > limit : value < limit);
  return (
    <span className={`bullet ${beyond ? 'is-beyond' : ''}`} role="img" aria-label={label}>
      <i className="bullet-fill" style={{ width: pct(value) }} />
      {baseline != null && <i className="bullet-base" style={{ left: pct(baseline) }} />}
      {limit != null && <i className="bullet-limit" style={{ left: pct(limit) }} />}
    </span>
  );
}
