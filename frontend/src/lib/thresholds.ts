import type { Machine, Sample } from './types';

/**
 * Mirrors the status rules in backend/app/simulation/engine.py (FactoryEngine._status):
 *   critical  fault in (high_vibration, bearing_wear, overheating) or health < 40
 *   warning   other fault, or health < 75, or temperature > 1.25 x baseline, or vibration > 5 mm/s
 * The API does not expose these limits, so they are restated here. If the engine rules change, change them here too.
 */
export const WARN_TEMP_FACTOR = 1.25;
export const WARN_VIBRATION = 5;
export const WARN_HEALTH = 75;
export const CRIT_HEALTH = 40;

export type MetricKey = 'temperature' | 'vibration' | 'pressure' | 'power_kw' | 'health';

export interface MetricDef {
  key: MetricKey;
  label: string;
  short: string;
  unit: string;
  digits: number;
  baseline?: (m: Machine) => number;
  warnAbove?: (m: Machine) => number;
  warnBelow?: (m: Machine) => number;
}

export const METRICS: Record<MetricKey, MetricDef> = {
  temperature: {
    key: 'temperature', label: 'Temperature', short: 'Temp', unit: '°C', digits: 1,
    baseline: (m) => m.base_temp, warnAbove: (m) => m.base_temp * WARN_TEMP_FACTOR,
  },
  vibration: {
    key: 'vibration', label: 'Vibration', short: 'Vib', unit: 'mm/s', digits: 2,
    baseline: (m) => m.base_vibration, warnAbove: () => WARN_VIBRATION,
  },
  pressure: { key: 'pressure', label: 'Pressure', short: 'Press', unit: 'bar', digits: 2, baseline: (m) => m.base_pressure },
  power_kw: { key: 'power_kw', label: 'Power draw', short: 'Power', unit: 'kW', digits: 1, baseline: (m) => m.power },
  health: {
    key: 'health', label: 'Health', short: 'Health', unit: '%', digits: 0,
    baseline: () => 100, warnBelow: () => WARN_HEALTH,
  },
};

export const FAULTS: { value: string; label: string; critical: boolean; hint: string }[] = [
  { value: 'high_vibration', label: 'Excessive vibration', critical: true, hint: 'Vibration and temperature climb, power draw rises 30%.' },
  { value: 'bearing_wear', label: 'Bearing wear', critical: true, hint: 'Same signature as excessive vibration; logged as bearing wear.' },
  { value: 'overheating', label: 'Overheating', critical: true, hint: 'Temperature climbs towards twice baseline.' },
  { value: 'pressure_drop', label: 'Pressure drop', critical: false, hint: 'Pressure falls. A warning until health drops below 40.' },
];

export const series = (samples: Sample[] | undefined, key: MetricKey): number[] => (samples ?? []).map((s) => s[key]);

export function stats(values: number[]) {
  if (!values.length) return null;
  let min = Infinity, max = -Infinity, sum = 0;
  for (const v of values) { if (v < min) min = v; if (v > max) max = v; sum += v; }
  return { min, max, mean: sum / values.length, last: values[values.length - 1], first: values[0], n: values.length };
}

/** Median spacing between samples, in seconds (the engine ticks every 2 s). */
export function sampleInterval(samples: Sample[]): number {
  if (samples.length < 2) return 2;
  const d: number[] = [];
  for (let i = 1; i < samples.length; i++) d.push((Date.parse(samples[i].timestamp) - Date.parse(samples[i - 1].timestamp)) / 1000);
  d.sort((a, b) => a - b);
  return Math.max(0.5, d[Math.floor(d.length / 2)] || 2);
}

export const stageOf = (m: Machine) => m.position + 1;
