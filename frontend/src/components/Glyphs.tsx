import type { MachineStatus } from '../lib/types';

export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg className="brandmark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 1v8M16 23v8M1 16h8M23 16h8" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle className="brandmark-core" cx="16" cy="16" r="4.5" fill="var(--acid)" />
    </svg>
  );
}

export const STATUS_LABEL: Record<MachineStatus, string> = {
  running: 'Running',
  warning: 'Warning',
  critical: 'Critical',
  paused: 'Paused',
};

/** Shape carries the state, colour reinforces it: dot = running, ring = paused, hollow triangle = warning, solid diamond = critical. */
export function StatusGlyph({ status, size = 12 }: { status: MachineStatus; size?: number }) {
  return (
    <svg className={`glyph glyph-${status}`} width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
      {status === 'running' && <circle cx="6" cy="6" r="3.6" fill="currentColor" />}
      {status === 'paused' && <circle cx="6" cy="6" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.5" />}
      {status === 'warning' && <path d="M6 1.4 11 10.4H1Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="miter" />}
      {status === 'critical' && <path d="M6 .4 11.6 6 6 11.6.4 6Z" fill="currentColor" />}
    </svg>
  );
}

export function StatusTag({ status, label }: { status: MachineStatus; label?: string }) {
  return (
    <span className={`tag tag-${status}`}>
      <StatusGlyph status={status} />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

/* Line pictograms, one per machine. 120 x 72, strokes are non-scaling so they stay crisp at any size. */
const P: Record<string, JSX.Element> = {
  'M-01': (
    <>
      <rect x="8" y="42" width="104" height="13" rx="6.5" />
      <circle cx="15" cy="48.5" r="2.6" />
      <circle cx="105" cy="48.5" r="2.6" />
      <path d="M32 55v11M60 55v11M88 55v11M16 66h88" />
      <rect x="22" y="27" width="17" height="15" />
      <rect x="62" y="31" width="13" height="11" />
      <rect x="87" y="29" width="16" height="13" />
      <path d="M22 33h17M87 35h16" />
    </>
  ),
  'M-02': (
    <>
      <rect x="12" y="58" width="96" height="7" />
      <path d="M22 58V20M98 58V20" />
      <rect x="18" y="14" width="84" height="8" />
      <rect x="51" y="22" width="18" height="14" />
      <path d="M60 36v11" />
      <path d="M57 47h6l-3 5Z" />
      <rect x="40" y="52" width="40" height="6" />
      <path d="M44 8l4 4M72 8l4 4M58 5l3 4" strokeDasharray="0" />
    </>
  ),
  'M-03': (
    <>
      <rect x="20" y="30" width="80" height="34" />
      <rect x="32" y="40" width="34" height="24" />
      <rect x="78" y="12" width="12" height="18" />
      <path d="M36 25c3-4 5 4 8 0s5 4 8 0M36 17c3-4 5 4 8 0s5 4 8 0" />
      <circle cx="42" cy="58" r="2" />
      <circle cx="50" cy="54" r="2" />
      <circle cx="58" cy="58" r="2" />
      <path d="M14 64h92M76 44h16M76 52h16" />
    </>
  ),
  'M-04': (
    <>
      <rect x="36" y="58" width="48" height="8" />
      <rect x="54" y="48" width="12" height="10" />
      <circle cx="60" cy="44" r="5" />
      <g transform="rotate(-40 60 44)">
        <rect x="56" y="22" width="8" height="22" rx="4" />
      </g>
      <circle cx="46" cy="27" r="4" />
      <g transform="rotate(-80 46 27)">
        <rect x="42" y="27" width="8" height="28" rx="4" />
      </g>
      <path d="M74 22h7M74 37h7M81 22v15" />
      <rect x="88" y="54" width="18" height="12" />
    </>
  ),
  'M-05': (
    <>
      <rect x="8" y="54" width="104" height="6" />
      <path d="M18 60v6M102 60v6" />
      <rect x="20" y="34" width="24" height="20" />
      <path d="M32 34v20M20 34l12 6 12-6" />
      <rect x="56" y="39" width="20" height="15" />
      <path d="M66 39v15" />
      <rect x="84" y="18" width="24" height="11" />
      <path d="M96 29v14" />
      <rect x="89" y="43" width="14" height="5" />
    </>
  ),
};

export function MachinePictogram({ id, className = '', ...pos }: { id: string; className?: string; x?: number; y?: number; width?: number; height?: number }) {
  return (
    <svg className={`picto ${className}`} {...pos} viewBox="0 0 120 72" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      {P[id] ?? <rect x="30" y="16" width="60" height="40" />}
    </svg>
  );
}
