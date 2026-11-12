import type { ReactNode } from 'react';

/** Minimal markdown for model output: headings, bullets, numbered lists, **bold**, and [n] citation chips. Never uses innerHTML. */
function inline(text: string, onCite?: (n: number) => void): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\[\d+\])/g;
  let last = 0, k = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else {
      const n = Number(tok.slice(1, -1));
      out.push(<button key={k++} type="button" className="cite" onClick={() => onCite?.(n)} aria-label={`Go to source ${n}`}>{n}</button>);
    }
    last = i + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function RichText({ text, onCite }: { text: string; onCite?: (n: number) => void }) {
  const blocks: ReactNode[] = [];
  const lines = text.split('\n');
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  let k = 0;
  const flushPara = () => { if (para.length) { blocks.push(<p key={k++}>{inline(para.join(' '), onCite)}</p>); para = []; } };
  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(<Tag key={k++} className={list.ordered ? 'rt-ol' : 'rt-ul'}>{list.items.map((it, i) => <li key={i}>{inline(it, onCite)}</li>)}</Tag>);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) { flushPara(); flushList(); }
    else if (h) { flushPara(); flushList(); blocks.push(<h4 key={k++} className="rt-h">{inline(h[1], onCite)}</h4>); }
    else if (ul || ol) {
      flushPara();
      const ordered = !!ol;
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((ul ?? ol)![1]);
    } else { flushList(); para.push(line.trim()); }
  }
  flushPara(); flushList();
  return <div className="richtext">{blocks}</div>;
}
