const nf = new Intl.NumberFormat('en-US');
export const int = (n: number) => nf.format(Math.round(n));
export const fix = (n: number | null | undefined, d = 1) => (n == null || Number.isNaN(n) ? '–' : n.toFixed(d));
export const pad2 = (n: number) => String(n).padStart(2, '0');

export const clock = (iso: string | number | Date, withSeconds = true) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', ...(withSeconds ? { second: '2-digit' } : {}), hour12: false });

export function ago(iso: string | number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${pad2(s % 60)}s ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${pad2(m % 60)}m ago`;
}

export function duration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${pad2(m)}m` : m ? `${m}m ${pad2(s % 60)}s` : `${s}s`;
}

/** SQLite CURRENT_TIMESTAMP is UTC without a zone marker: "2026-10-28 18:26:27". */
export function sqliteDate(s: string) {
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', hour12: false });
}

export const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const sentence = (s: string) => {
  const t = s.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Document id is the part of a chunk id before "-p<page>-c<n>". */
export const docIdFromChunk = (chunkId: string) => chunkId.replace(/-p\d+-c\d+$/, '');
