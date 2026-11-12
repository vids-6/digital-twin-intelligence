import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerDownLeft } from 'lucide-react';
import { Modal } from './Overlay';
import { StatusGlyph } from './Glyphs';
import { ROUTES, navigate } from '../lib/router';
import { useFactory } from '../state/factory';
import { useSession } from '../state/session';
import { pad2 } from '../lib/format';

interface Cmd { id: string; group: string; label: string; hint?: string; keywords?: string; node?: React.ReactNode; run: () => void }

export function Palette() {
  const { paletteOpen, setPaletteOpen, toast, setSearch } = useSession();
  const { machines, overview, act, select } = useFactory();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(!paletteOpen); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [paletteOpen, setPaletteOpen]);

  useEffect(() => { if (paletteOpen) { setQ(''); setActive(0); } }, [paletteOpen]);

  const close = () => setPaletteOpen(false);
  const all = useMemo<Cmd[]>(() => {
    const go = (p: string) => () => { close(); navigate(p); };
    const cmds: Cmd[] = ROUTES.map((r, i) => ({ id: `go-${r.path}`, group: 'Go to', label: r.title, hint: pad2(i + 1), keywords: r.nav, run: go(r.path) }));
    machines.forEach((m) => cmds.push({
      id: `m-${m.id}`, group: 'Machines', label: `${m.id}  ${m.name}`, keywords: `${m.type} ${m.status}`,
      node: <StatusGlyph status={m.status} />, run: () => { close(); select(m.id); navigate(`/machines/${m.id}`); },
    }));
    cmds.push(
      { id: 'sim-toggle', group: 'Simulation', label: overview?.running ? 'Pause simulation' : 'Resume simulation', keywords: 'start stop run', run: () => { close(); act(overview?.running ? '/simulation/pause' : '/simulation/start', undefined, overview?.running ? 'Simulation paused' : 'Simulation running'); } },
      { id: 'sim-reset', group: 'Simulation', label: 'Reset factory', hint: 'clears incidents', keywords: 'restart clear', run: () => { close(); act('/simulation/reset', undefined, 'Factory reset'); } },
      { id: 'eval', group: 'Actions', label: 'Go to retrieval evaluation', keywords: 'rag metrics precision', run: go('/evaluation') },
    );
    return cmds;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machines, overview?.running]);

  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = terms.length ? all.filter((c) => terms.every((t) => `${c.group} ${c.label} ${c.keywords ?? ''}`.toLowerCase().includes(t))) : all;
    const extra: Cmd[] = q.trim()
      ? [{ id: 'search', group: 'Library', label: `Search the library for “${q.trim()}”`, run: () => { close(); setSearch({ query: q.trim(), hits: null, ranFor: '' }); navigate(`/library?q=${encodeURIComponent(q.trim())}`); } }]
      : [];
    return [...list, ...extra];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, all]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => { listRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); results[active]?.run(); }
  };

  let lastGroup = '';
  return (
    <Modal open={paletteOpen} onClose={close} label="Command palette" className="palette" place="top">
      <div className="palette-input" onKeyDown={onKey}>
        <input data-autofocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Go to a page, open a machine, run an action…" aria-label="Search commands" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={results[active] ? `pal-${results[active].id}` : undefined} spellCheck={false} autoComplete="off" />
        <kbd className="mono">esc</kbd>
      </div>
      <ul id="palette-list" className="palette-list" role="listbox" ref={listRef} onKeyDown={onKey}>
        {results.length === 0 && <li className="palette-none">Nothing matches “{q}”.</li>}
        {results.map((c, i) => {
          const head = c.group !== lastGroup ? c.group : null;
          lastGroup = c.group;
          return (
            <li key={c.id} role="presentation">
              {head && <div className="palette-group">{head}</div>}
              <div id={`pal-${c.id}`} role="option" aria-selected={i === active} className={`palette-item ${i === active ? 'is-active' : ''}`} onPointerMove={() => setActive(i)} onClick={c.run}>
                {c.node && <span className="palette-node">{c.node}</span>}
                <span className="palette-label">{c.label}</span>
                {c.hint && <span className="palette-hint mono">{c.hint}</span>}
                {i === active && <CornerDownLeft size={13} className="palette-enter" />}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="palette-foot mono"><span>↑↓ move</span><span>↵ select</span><span>esc close</span></div>
    </Modal>
  );
}
