import { useMemo } from 'react';
import { StatusGlyph, StatusTag } from '../components/Glyphs';
import { PageHead, SectionHead } from '../components/PageHead';
import { EmptyState } from '../components/States';
import { sentence } from '../lib/format';
import { navigate } from '../lib/router';
import { useFactory } from '../state/factory';

const W = 1200, H = 330, Y = 150, R = 40;
const nodeX = (i: number, n: number) => 130 + i * ((W - 260) / Math.max(1, n - 1));

export function Dependencies() {
  const { deps, machines, incidents, select } = useFactory();
  const nodes = deps?.nodes ?? [];
  const edges = deps?.edges ?? [];

  // transitive downstream set per node, from the real edge list
  const downstream = useMemo(() => {
    const next = new Map<string, string[]>();
    edges.forEach((e) => next.set(e.source, [...(next.get(e.source) ?? []), e.target]));
    const walk = (id: string, seen = new Set<string>()): Set<string> => {
      (next.get(id) ?? []).forEach((t) => { if (!seen.has(t)) { seen.add(t); walk(t, seen); } });
      return seen;
    };
    return Object.fromEntries(nodes.map((n) => [n.id, walk(n.id)])) as Record<string, Set<string>>;
  }, [nodes, edges]);

  if (!deps) return <EmptyState title="Loading dependency data" mark="chart" />;

  const idx = Object.fromEntries(nodes.map((n, i) => [n.id, i]));
  const active = deps.propagation;
  const direct = new Set(edges.map((e) => `${e.source}>${e.target}`));
  const nameOf = (id: string) => nodes.find((n) => n.id === id)?.name ?? id;
  const first = active.length ? Math.min(...active.map((p) => idx[p.source] ?? 99)) : null;

  return (
    <>
      <PageHead
        title="Dependencies"
        lead="Which machines feed which. Arrows are material flow, not a promise that a fault will travel along them."
        spec={[
          { k: 'Machines', v: nodes.length },
          { k: 'Flow links', v: edges.length },
          { k: 'Active incidents', v: active.length, tone: active.length ? 'signal' : undefined },
          { k: 'Source', v: '/api/dependencies' },
        ]}
      />

      <section className="block">
        <div className="dep-graph-wrap" tabIndex={0} role="region" aria-label="Dependency chain, scrolls sideways on narrow screens">
        <svg className="dep-graph" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Machine dependency chain">
          <defs>
            <marker id="dep-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M0 0 10 5 0 10z" className="dep-arrowhead" /></marker>
            <pattern id="dep-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" className="dep-hatchline" /></pattern>
          </defs>

          {first != null && first < nodes.length - 1 && (
            <g>
              <rect className="dep-cone" x={nodeX(first, nodes.length)} y={Y - 62} width={nodeX(nodes.length - 1, nodes.length) + 70 - nodeX(first, nodes.length)} height="124" fill="url(#dep-hatch)" />
              <text className="dep-cone-label" x={nodeX(first, nodes.length) + 60} y={Y - 74}>Potential exposure if the line stops</text>
            </g>
          )}

          {edges.map((e) => {
            const a = idx[e.source], b = idx[e.target];
            if (a == null || b == null) return null;
            const x1 = nodeX(a, nodes.length) + R + 4, x2 = nodeX(b, nodes.length) - R - 6;
            return (
              <g key={`${e.source}${e.target}`}>
                <line className="dep-edge" x1={x1} x2={x2} y1={Y} y2={Y} markerEnd="url(#dep-arrow)" />
                <text className="dep-edge-label" x={(x1 + x2) / 2} y={Y - 12} textAnchor="middle">{e.label}</text>
              </g>
            );
          })}

          {nodes.map((n, i) => {
            const x = nodeX(i, nodes.length);
            const hasInc = active.some((p) => p.source === n.id);
            return (
              <g key={n.id} className={`dep-node st-${n.status} ${hasInc ? 'has-incident' : ''}`} role="link" tabIndex={0} aria-label={`${n.id} ${n.name}, ${n.status}. Open machine detail`}
                onClick={() => { select(n.id); navigate(`/machines/${n.id}`); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { select(n.id); navigate(`/machines/${n.id}`); } }}>
                <circle className="dep-ring" cx={x} cy={Y} r={R} />
                <text className="dep-id" x={x} y={Y + 6} textAnchor="middle">{n.id}</text>
                <text className="dep-stage" x={x} y={Y + R + 28} textAnchor="middle">{n.name}</text>
                <text className="dep-sub" x={x} y={Y + R + 50} textAnchor="middle">Stage {i + 1} · health {Math.round(n.health)}%</text>
                {n.fault && <text className="dep-fault" x={x} y={Y + R + 72} textAnchor="middle">{sentence(n.fault)}</text>}
              </g>
            );
          })}
        </svg>
        </div>
      </section>

      <div className="dep-split">
        <section className="block">
          <SectionHead title="Dependency matrix" note="Read across: the row machine feeds the column machine." />
          <div className="table-scroll">
            <table className="matrix">
              <thead>
                <tr><th scope="col"><span className="sr-only">Feeds</span></th>{nodes.map((n) => <th key={n.id} scope="col" className="mono">{n.id}</th>)}</tr>
              </thead>
              <tbody>
                {nodes.map((r) => (
                  <tr key={r.id}>
                    <th scope="row"><span className="mono">{r.id}</span> <span className="matrix-name">{r.name}</span></th>
                    {nodes.map((c) => {
                      const isDirect = direct.has(`${r.id}>${c.id}`);
                      const isIndirect = !isDirect && downstream[r.id]?.has(c.id);
                      return (
                        <td key={c.id} className={isDirect ? 'is-direct' : isIndirect ? 'is-indirect' : r.id === c.id ? 'is-self' : ''}>
                          <span className="sr-only">{isDirect ? 'feeds directly' : isIndirect ? 'feeds indirectly' : 'no flow'}</span>
                          <i aria-hidden="true" />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="matrix-key"><li><i className="k-direct" /> Feeds directly</li><li><i className="k-indirect" /> Downstream of it</li></ul>
        </section>

        <section className="block">
          <SectionHead title="Incident exposure" note="For each active incident, the stages further along the line." />
          {active.length === 0 ? (
            <EmptyState title="No active incidents" mark="clear" action={<a className="btn btn-sm" href="#/floor">Inject a fault on the floor</a>}>Nothing is currently affecting the line. Inject a fault to see which stages sit downstream.</EmptyState>
          ) : (
            <ol className="exposure">
              {active.map((p) => {
                const inc = incidents.find((i) => i.id === p.incident_id);
                const down = [...(downstream[p.source] ?? [])];
                const m = machines.find((x) => x.id === p.source);
                return (
                  <li key={p.incident_id} className={`exposure-row sev-${p.severity}`}>
                    <div className="exposure-head">
                      <span className="mono">{p.incident_id}</span>
                      <StatusTag status={p.severity} />
                    </div>
                    <p className="exposure-title">{inc?.title ?? 'Incident'} on {m?.name ?? p.source}</p>
                    {down.length ? (
                      <p className="exposure-body">
                        {down.length} downstream {down.length === 1 ? 'stage' : 'stages'} could be affected by a stoppage:
                        {' '}{down.map((d) => `${d} ${nameOf(d)}`).join(', ')}.
                      </p>
                    ) : (
                      <p className="exposure-body">Final stage. Nothing is downstream; material could back up from {p.source}.</p>
                    )}
                    <a className="btn btn-sm" href={`#/investigate?m=${p.source}&inc=${p.incident_id}`}>Investigate</a>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
