const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'why', 'how', 'what', 'into', 'can', 'not', 'but', 'should', 'which', 'could', 'would', 'come', 'first', 'likely', 'about', 'there', 'their', 'have', 'been', 'does', 'when', 'where', 'who', 'its', 'any', 'all', 'one']);

/** Split text into segments, marking words that match the (stemmed-by-prefix) query terms. */
export function highlight(text: string, query: string): { text: string; hit: boolean }[] {
  const terms = Array.from(new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])).filter((t) => !STOP.has(t));
  if (!terms.length) return [{ text, hit: false }];
  const stems = terms.map((t) => (t.length > 5 ? t.slice(0, t.length - 1) : t)).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`\\b(${stems.join('|')})[a-z0-9]*`, 'gi');
  const out: { text: string; hit: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i), hit: false });
    out.push({ text: m[0], hit: true });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out;
}

/** Maintenance manuals use ALL-CAPS section headings inside the text. Turn "A B C Rest..." into heading + body when found. */
export function splitHeadings(text: string): { heading?: string; body: string }[] {
  const re = /(?:^|\s)((?:[A-Z][A-Z&/-]{2,}(?:\s+(?:AND|OF|&|—|[A-Z][A-Z&/-]{2,}))*))(?=\s+[A-Z](?:[a-z]|\s))/g;
  const parts: { heading?: string; body: string }[] = [];
  let last = 0;
  let pendingHeading: string | undefined;
  for (const m of text.matchAll(re)) {
    const idx = (m.index ?? 0) + (m[0].length - m[1].length);
    const before = text.slice(last, idx).trim();
    if (before || pendingHeading) parts.push({ heading: pendingHeading, body: before });
    pendingHeading = m[1];
    last = idx + m[1].length;
  }
  const rest = text.slice(last).trim();
  if (rest || pendingHeading) parts.push({ heading: pendingHeading, body: rest });
  return parts.filter((p) => p.heading || p.body);
}
