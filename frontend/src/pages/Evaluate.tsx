import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { ScoreBar } from '../components/Meters';
import { PageHead, SectionHead } from '../components/PageHead';
import { EmptyState, Skeleton } from '../components/States';
import { api } from '../lib/api';
import { clock, fix } from '../lib/format';
import type { EvalDatasetItem, EvalRun, EvalStoredRun } from '../lib/types';
import { useFactory } from '../state/factory';
import { useSession } from '../state/session';

type MetricKey = keyof EvalRun['metrics'];
const METRICS: { key: MetricKey; label: string; how: string }[] = [
  { key: 'precision_at_k', label: 'Precision@K', how: 'Relevant passages retrieved, divided by K. A passage counts as relevant if its text or file name contains any of the query’s expected terms.' },
  { key: 'recall_at_k', label: 'Recall@K', how: 'Relevant passages retrieved, divided by the number of expected terms, capped at 1. A proxy: it does not know how many relevant passages exist.' },
  { key: 'mean_reciprocal_rank', label: 'Mean reciprocal rank', how: 'One divided by the rank of the first relevant passage, averaged over queries. 1.0 means a relevant passage was always first.' },
  { key: 'citation_source_correctness', label: 'Citation integrity', how: 'Whether every retrieved passage carries a document name and chunk id. It checks metadata is present, not that a citation is accurate.' },
  { key: 'groundedness_proxy', label: 'Groundedness proxy', how: 'Relevant passages divided by passages retrieved. A keyword check, not a test of whether an answer is supported.' },
];

export function Evaluate() {
  const { system } = useFactory();
  const { evalRuns, addEvalRun, toast } = useSession();
  const [dataset, setDataset] = useState<EvalDatasetItem[] | null>(null);
  const [running, setRunning] = useState(false);
  const [dsError, setDsError] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    api<{ dataset: EvalDatasetItem[] }>('/evaluation/dataset', { signal: ctl.signal }).then((r) => setDataset(r.dataset)).catch((e) => e.name !== 'AbortError' && setDsError(e.message));
    return () => ctl.abort();
  }, []);

  async function run() {
    setRunning(true);
    try {
      const r = await api<EvalRun>('/evaluation/run', { method: 'POST' });
      addEvalRun({ key: `${Date.now()}`, at: new Date().toISOString(), chunksIndexed: system?.chunks_indexed ?? null, documentsIndexed: system?.documents_indexed ?? null, run: r });
      toast('ok', 'Evaluation finished');
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Evaluation failed'); }
    finally { setRunning(false); }
  }

  const latest = evalRuns[0];
  const prev = evalRuns[1];

  return (
    <>
      <PageHead
        title="Evaluation"
        lead="Runs a fixed set of questions against the library and scores what comes back. The scores are computed live from the current index."
        actions={<button className="btn btn-primary btn-lg" onClick={run} disabled={running}><Play size={15} /> {running ? 'Running…' : latest ? 'Run again' : 'Run evaluation'}</button>}
        spec={[
          { k: 'Questions', v: dataset?.length ?? latest?.run.dataset_size ?? '–' },
          { k: 'Passages per question (K)', v: latest?.run.k ?? 5 },
          { k: 'Library now', v: system ? `${system.documents_indexed} docs, ${system.chunks_indexed} passages` : '–' },
          { k: 'Last run', v: latest ? clock(latest.at) : 'Not yet' },
        ]}
      />

      {running && !latest && <div className="rel-skel"><Skeleton h={160} /><Skeleton h={260} /></div>}

      {latest ? (
        <Results latest={latest} prev={prev} running={running} />
      ) : (
        !running && (
          <section className="block">
            <SectionHead title="Evaluation set" note="These are the questions that will run. Each lists the terms a passage must contain to count as relevant." />
            {dsError && <EmptyState title="Could not load the evaluation set" mark="chart">{dsError}</EmptyState>}
            {!dataset && !dsError && <Skeleton h={220} />}
            {dataset && (
              <div className="table-scroll">
                <table className="tbl evalset">
                  <thead><tr><th>Id</th><th>Topic</th><th>Query sent to the index</th><th>Expected terms</th></tr></thead>
                  <tbody>
                    {dataset.map((d) => (
                      <tr key={d.id}>
                        <td className="mono">{d.id}</td><td><b>{d.description}</b></td><td className="mono evalset-q">{d.query}</td>
                        <td><span className="terms">{d.relevant_terms.map((t) => <span key={t} className="tag tag-plain">{t}</span>)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="eval-first">No results yet. Run the evaluation to score these questions against the {system?.chunks_indexed ?? '…'} indexed passages.</p>
          </section>
        )
      )}

      <section className="block">
        <SectionHead title="How each score is computed" note="Taken from backend/app/evaluation/metrics.py. These are lightweight proxies for demonstration, not benchmark results." />
        <dl className="defs">
          {METRICS.map((m) => <div key={m.key}><dt>{m.label}</dt><dd>{m.how}</dd></div>)}
        </dl>
      </section>
    </>
  );
}

function Results({ latest, prev, running }: { latest: EvalStoredRun; prev?: EvalStoredRun; running: boolean }) {
  const { run } = latest;
  const { evalRuns } = useSession();
  const chunks = latest.chunksIndexed;
  const allFull = run.results.every((r) => r.retrieved >= run.k);
  const zero = run.results.reduce((n, r) => n + r.sources.filter((s) => s.score <= 0.0001).length, 0);

  return (
    <div className={running ? 'is-refetching' : ''}>
      <section className="block">
        <div className="evals">
          {METRICS.map((m) => {
            const v = run.metrics[m.key];
            const d = prev ? v - prev.run.metrics[m.key] : null;
            return (
              <div key={m.key} className="eval">
                <span className="eval-label">{m.label}</span>
                <b className="eval-num display">{v.toFixed(3)}</b>
                <ScoreBar value={v} tone="acid" label={`${m.label} ${v.toFixed(3)} out of 1`} />
                <span className="eval-delta mono">{d == null ? 'First run' : Math.abs(d) < 0.0005 ? 'No change since last run' : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(3)} since last run`}</span>
              </div>
            );
          })}
        </div>
      </section>

      <aside className="caveat" aria-label="How to read these scores">
        <h3>Read these scores with the corpus in mind</h3>
        <ul>
          <li>The library holds <b>{chunks ?? '?'}</b> passages{latest.documentsIndexed != null && <> in <b>{latest.documentsIndexed}</b> documents</>}. Every question retrieves its top <b>{run.k}</b>{allFull && chunks != null ? <>, so {run.k} of {chunks} passages are returned each time</> : ''}{zero > 0 ? <>, including <b>{zero}</b> with a similarity of zero</> : ''}. With a corpus this small, precision is capped by what exists, not only by how well the search ranks.</li>
          <li>Relevance is a keyword match against the expected terms, not a judgement by a maintenance expert. A high score means the keywords appear, not that the passage answers the question.</li>
          <li>Citation integrity only checks that document names and chunk ids are present.</li>
        </ul>
      </aside>

      <section className="block">
        <SectionHead title="Results by question" note={`${run.dataset_size} questions, K = ${run.k}. Each bar below a rank is that passage's similarity to the query, on a 0 to 1 scale.`} />
        <ol className="qres">
          {run.results.map((r) => (
            <li key={r.id} className="qr">
              <div className="qr-head">
                <span className="mono qr-id">{r.id}</span>
                <div><b>{r.description}</b><p className="mono">{r.query}</p></div>
                <span className="qr-rel mono"><b>{r.relevant_retrieved}</b> of {r.retrieved} relevant</span>
              </div>
              <div className="qr-body">
                <dl className="qr-scores">
                  {([['Precision', r.precision_at_k], ['Recall', r.recall_at_k], ['Reciprocal rank', r.reciprocal_rank]] as const).map(([k, v]) => (
                    <div key={k}><dt>{k}</dt><dd className="mono">{v.toFixed(3)}</dd><ScoreBar value={v} label={`${k} ${v.toFixed(3)}`} /></div>
                  ))}
                </dl>
                <ol className="ranks" aria-label="Retrieved passages by rank">
                  {r.sources.map((s, i) => (
                    <li key={s.chunk_id} title={`${s.document_name}, similarity ${s.score.toFixed(3)}`}>
                      <span className="rank-bar" aria-hidden="true"><i style={{ height: `${Math.max(2, s.score * 100)}%` }} /></span>
                      <span className="mono rank-v">{fix(s.score, 2)}</span>
                      <span className="rank-n mono">#{i + 1}</span>
                      <span className="rank-d">{s.document_name.replace(/\.(txt|pdf)$/i, '').replace(/_/g, ' ')}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </li>
          ))}
        </ol>
        <p className="eval-note">{run.note}</p>
      </section>

      {evalRuns.length > 1 && (
        <section className="block">
          <SectionHead title="Runs this session" note="Add or remove a document in the Library, run again, and compare. Cleared when you reload the page." />
          <div className="table-scroll">
            <table className="tbl">
              <thead><tr><th>Time</th><th>Library</th><th className="r">Precision@K</th><th className="r">Recall@K</th><th className="r">MRR</th><th className="r">Groundedness</th></tr></thead>
              <tbody>
                {evalRuns.map((e) => (
                  <tr key={e.key} className="mono">
                    <td>{clock(e.at)}</td><td>{e.documentsIndexed ?? '?'} docs · {e.chunksIndexed ?? '?'} passages</td>
                    <td className="r">{e.run.metrics.precision_at_k.toFixed(3)}</td><td className="r">{e.run.metrics.recall_at_k.toFixed(3)}</td>
                    <td className="r">{e.run.metrics.mean_reciprocal_rank.toFixed(3)}</td><td className="r">{e.run.metrics.groundedness_proxy.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
