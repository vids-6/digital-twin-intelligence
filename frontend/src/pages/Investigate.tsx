import { useEffect, useMemo, useRef, useState } from 'react';
import { BrainCircuit, ChevronRight, Clipboard, Check, RotateCcw } from 'lucide-react';
import { Bullet } from '../components/Bullet';
import { StatusGlyph, StatusTag } from '../components/Glyphs';
import { ScoreBar } from '../components/Meters';
import { PageHead } from '../components/PageHead';
import { RichText } from '../components/RichText';
import { EmptyState, Skeleton } from '../components/States';
import { api } from '../lib/api';
import { clock, docIdFromChunk, fix, sentence } from '../lib/format';
import { replaceRoute, useRoute } from '../lib/router';
import { parseAnswer } from '../lib/report';
import { highlight } from '../lib/text';
import { WARN_HEALTH, WARN_TEMP_FACTOR, WARN_VIBRATION } from '../lib/thresholds';
import type { CaseReport, Incident, Investigation, Machine } from '../lib/types';
import { useFactory } from '../state/factory';
import { DEFAULT_QUESTION, useSession } from '../state/session';

const DEPTHS = [3, 5, 8];

const PROMPTS = (m: Machine) => [
  { label: 'Vibration and heat', text: `Why is the ${m.name} vibrating excessively and overheating?` },
  { label: 'Maintenance checklist', text: `What maintenance checks are recommended for the ${m.name}?` },
  { label: 'Downstream impact', text: `Could a problem on the ${m.name} affect downstream production?` },
];

export function Investigate() {
  const { query } = useRoute();
  const { machines, incidents, selected, selectedId, select, system } = useFactory();
  const { reports, activeReport, addReport, nextRef, setActiveReport, draftQuestion, setDraftQuestion } = useSession();
  const [topK, setTopK] = useState(5);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Arriving from an incident link: pre-select the machine and draft a question about that incident.
  const qm = query.get('m'), qi = query.get('inc');
  useEffect(() => {
    if (!qm) return;
    const m = machines.find((x) => x.id === qm);
    if (!m) return;
    select(qm);
    const inc = qi ? incidents.find((i) => i.id === qi) : undefined;
    if (inc) {
      setDraftQuestion(`${sentence(inc.title)} on the ${m.name} (${inc.id}). What are the likely causes, and which checks should come first?`);
      setActiveReport(null);
    }
    replaceRoute('/investigate');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qm, qi, machines.length]);

  const m = selected;
  const mIncidents = useMemo(() => incidents.filter((i) => i.machine_id === m?.id), [incidents, m?.id]);
  const report = reports.find((r) => r.key === activeReport) ?? null;
  const invalid = touched && draftQuestion.trim().length < 5;

  async function run() {
    if (!m) return;
    if (draftQuestion.trim().length < 5) { setTouched(true); textRef.current?.focus(); return; }
    setRunning(true); setError(null); setActiveReport(null);
    try {
      const result = await api<Investigation>('/investigate', { method: 'POST', body: { question: draftQuestion.trim(), machine_id: m.id, top_k: topK } });
      addReport({
        key: `${Date.now()}`, ref: nextRef(), at: new Date().toISOString(), machineName: m.name, topK,
        incidents: mIncidents, baseline: { base_temp: m.base_temp, base_vibration: m.base_vibration, base_pressure: m.base_pressure, fault: m.fault }, result,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The investigation failed.');
    } finally { setRunning(false); }
  }

  const llmOn = !!system?.llm_configured;

  return (
    <>
      <PageHead
        title="Investigator"
        lead="Pair a machine's live readings with the maintenance library, then read what the evidence does and does not support."
        spec={[
          { k: 'Generation', v: llmOn ? `LLM · ${system?.llm_model}` : 'Retrieval only' },
          { k: 'Library', v: `${system?.documents_indexed ?? '–'} documents, ${system?.chunks_indexed ?? '–'} passages` },
          { k: 'Reports this session', v: reports.length },
        ]}
      />

      <div className="inv-grid">
        <aside className="inv-setup" aria-label="Case setup">
          <h2 className="inv-h">Case setup</h2>

          <div className="field">
            <span className="label" id="mach-l">Machine under investigation</span>
            <div className="picker" role="group" aria-labelledby="mach-l">
              {[...machines].sort((a, b) => a.position - b.position).map((x) => (
                <button key={x.id} className="picker-row" aria-pressed={x.id === selectedId} onClick={() => select(x.id)}>
                  <StatusGlyph status={x.status} />
                  <b className="mono">{x.id}</b>
                  <span className="picker-name">{x.name}</span>
                  <span className="mono picker-h">{Math.round(x.health)}%</span>
                </button>
              ))}
            </div>
          </div>

          {mIncidents.length > 0 && (
            <div className="field">
              <span className="label">Active incidents on {m?.id}</span>
              <ul className="inc-pick">
                {mIncidents.map((i) => (
                  <li key={i.id}>
                    <button className="inc-pick-btn" onClick={() => { setDraftQuestion(`${sentence(i.title)} on the ${m!.name} (${i.id}). What are the likely causes, and which checks should come first?`); textRef.current?.focus(); }}>
                      <span className="mono">{i.id}</span> {i.title} <ChevronRight size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="field">
            <label htmlFor="inv-q">Question</label>
            <textarea id="inv-q" ref={textRef} className={`textarea ${invalid ? 'is-invalid' : ''}`} rows={4} value={draftQuestion} onChange={(e) => setDraftQuestion(e.target.value)} onBlur={() => setTouched(true)} placeholder="Describe the symptom, or ask a maintenance question." aria-invalid={invalid} aria-describedby={invalid ? 'inv-q-err' : undefined} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') run(); }} />
            {invalid && <span id="inv-q-err" className="field-error">Write at least a short sentence so the search has something to match.</span>}
            <div className="chips">
              {m && PROMPTS(m).map((p) => <button key={p.label} className="chip" onClick={() => { setDraftQuestion(p.text); setTouched(false); }}>{p.label}</button>)}
            </div>
          </div>

          <div className="field">
            <span className="label" id="depth-l">Passages to retrieve</span>
            <div className="seg" role="group" aria-labelledby="depth-l">
              {DEPTHS.map((d) => <button key={d} aria-pressed={topK === d} onClick={() => setTopK(d)}><span className="mono">{d}</span></button>)}
            </div>
          </div>

          <button className="btn btn-primary btn-block btn-lg" onClick={run} disabled={running || !m}>
            <BrainCircuit size={16} /> {running ? 'Investigating…' : 'Run investigation'}
          </button>
          <p className="inv-privacy">
            {llmOn ? <>An LLM is configured. The question, this machine's readings and the retrieved passages are sent to its provider to write the report.</> : <>No LLM key is configured, so this runs in retrieval-only mode and nothing leaves your machine.</>}
          </p>

          {reports.length > 0 && (
            <div className="history">
              <h3 className="inv-h2">Reports this session</h3>
              <ol>
                {reports.map((r) => (
                  <li key={r.key}>
                    <button className={r.key === activeReport ? 'is-active' : ''} onClick={() => { setActiveReport(r.key); setError(null); }}>
                      <span className="mono">{r.ref}</span>
                      <span className="history-q">{r.result.question}</span>
                      <span className="mono history-t">{r.result.machine} · {clock(r.at, false)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </aside>

        <section className="inv-report" aria-live="polite" aria-busy={running}>
          {running ? <ReportSkeleton /> : error ? (
            <EmptyState title="The investigation did not complete" mark="search" action={<button className="btn btn-primary" onClick={run}><RotateCcw size={14} /> Try again</button>}>{error}</EmptyState>
          ) : report ? (
            <Report r={report} onRerun={run} />
          ) : (
            <Intro />
          )}
        </section>
      </div>
    </>
  );
}

function Intro() {
  return (
    <div className="inv-intro">
      <h2>How an investigation runs</h2>
      <ol>
        <li><b>Read the machine.</b> The backend takes the machine's current simulated telemetry.</li>
        <li><b>Retrieve evidence.</b> It searches the maintenance library for the passages most similar to your question and those readings.</li>
        <li><b>Write the report.</b> With an LLM key it asks the model to separate documented facts from hypotheses. Without one it returns the retrieved evidence with standard guidance, and says so.</li>
      </ol>
      <p>Pick a machine, adjust the question, and run it. The report will appear here, with every claim tied to a source you can open.</p>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="sheet report reg" aria-label="Investigating">
      <Skeleton h={54} w="60%" /><div style={{ height: 22 }} /><Skeleton h={18} w="40%" /><div style={{ height: 36 }} />
      <Skeleton h={120} /><div style={{ height: 24 }} /><Skeleton h={160} /><div style={{ height: 24 }} /><Skeleton h={160} />
    </div>
  );
}

const SECTION = (n: number, title: string) => (
  <h3 className="rsec-h"><span className="rsec-n mono">{n}</span>{title}</h3>
);

function Report({ r, onRerun }: { r: CaseReport; onRerun: () => void }) {
  const { result: x } = r;
  const parsed = useMemo(() => parseAnswer(x.answer, x.mode), [x.answer, x.mode]);
  const [copied, setCopied] = useState(false);
  const top = x.sources.length ? Math.max(...x.sources.map((s) => s.score)) : 0;
  const llm = x.mode === 'llm_generated';

  const flash = (n: number) => {
    const el = document.getElementById(`src-${n}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash');
  };

  const copy = async () => {
    const lines = [
      `${r.ref}  Investigation report`, `Machine: ${x.machine} ${r.machineName}`, `Run at: ${new Date(r.at).toLocaleString()}`, `Mode: ${llm ? 'LLM generated' : 'Retrieval only'}`, `Question: ${x.question}`, '',
      'Readings', `  Temperature ${fix(x.telemetry.temperature, 1)} °C (baseline ${r.baseline.base_temp})`, `  Vibration ${fix(x.telemetry.vibration, 2)} mm/s (baseline ${r.baseline.base_vibration})`, `  Pressure ${fix(x.telemetry.pressure, 2)} bar (baseline ${r.baseline.base_pressure})`, `  Health ${fix(x.telemetry.health, 0)} %`, '',
      'Assessment', x.answer, '', 'Sources', ...x.sources.map((s) => `${s.citation} ${s.document_name} (page ${s.page ?? 'n/a'}, ${s.chunk_id}) similarity ${s.score.toFixed(3)}`),
      '', 'All telemetry is simulated. Hypotheses are not confirmed root causes.',
    ];
    try { await navigator.clipboard.writeText(lines.join('\n')); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* clipboard unavailable */ }
  };

  return (
    <article className="sheet report reg" key={r.key}>
      <header className="report-head">
        <div>
          <p className="report-ref mono">{r.ref}</p>
          <h2 className="report-title">Investigation report</h2>
        </div>
        <div className={`stamp ${llm ? 'is-llm' : ''}`} aria-label={llm ? 'Generated by a language model' : 'Retrieval only, no language model used'}>
          {llm ? 'LLM generated' : 'Retrieval only'}
          <small>{llm ? 'verify before use' : 'no LLM used'}</small>
        </div>
      </header>

      <dl className="report-meta">
        <div><dt>Machine</dt><dd>{x.machine} · {r.machineName}</dd></div>
        <div><dt>Run at</dt><dd className="mono">{clock(r.at)}</dd></div>
        <div><dt>Passages</dt><dd className="mono">{x.sources.length} of {r.topK} requested</dd></div>
        <div><dt>Status then</dt><dd><StatusTag status={x.telemetry.status} /></dd></div>
      </dl>
      <blockquote className="report-q">{x.question}</blockquote>

      <section className="rsec">
        {SECTION(1, 'Incident')}
        {r.incidents.length === 0 ? (
          <p className="rsec-p">No incident was active on {x.machine} when this ran. The report reflects current readings only.{r.baseline.fault ? ` The machine carries a ${sentence(r.baseline.fault)} fault.` : ''}</p>
        ) : (
          <ul className="rinc">
            {r.incidents.map((i: Incident) => (
              <li key={i.id}>
                <span className="mono">{i.id}</span> <StatusTag status={i.severity} />
                <b>{i.title}</b>
                <span className="mono rinc-t">{clock(i.timestamp)}</span>
                <span className="rinc-d">{i.description}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rsec">
        {SECTION(2, 'Observations')}
        <p className="rsec-note">Readings come with the report. Baselines and limits are the simulation's own parameters.</p>
        <Observations r={r} />
      </section>

      <section className="rsec">
        {SECTION(3, 'Assessment')}
        <div className={`strength ${x.evidence_sufficient ? '' : 'is-weak'}`}>
          <span className="strength-k">Evidence strength</span>
          <b>{x.evidence_sufficient ? 'Sufficient to discuss' : 'Weak'}</b>
          <span className="mono">best match {top.toFixed(3)}</span>
          <ScoreBar value={top} label={`Best similarity ${top.toFixed(3)}`} />
          <small>Similarity is the closest passage's score (0 to 1). It measures how alike the text is, not whether a diagnosis is right.</small>
        </div>

        {parsed.free && <RichText text={parsed.free} onCite={flash} />}
        {parsed.weakEvidence && <p className="rsec-p callout">{parsed.weakEvidence}</p>}
        {parsed.hypotheses && (
          <div className="assess">
            <h4>Plausible hypotheses <span className="tag-mini">not confirmed</span></h4>
            <p>{parsed.hypotheses}</p>
            <p className="assess-flag">Standard wording used by retrieval-only mode. It is the same for every question, so it is a prompt for thought, not a finding drawn from the sources below.</p>
          </div>
        )}
        {parsed.checks && (
          <div className="assess">
            <h4>Recommended checks</h4>
            <ol className="checks">{parsed.checks.map((c, i) => <li key={i}>{c}</li>)}</ol>
            <p className="assess-flag">Standard guidance from retrieval-only mode. Follow your site's procedures and the manufacturer's limits.</p>
          </div>
        )}
        {parsed.limitation && (
          <div className="assess"><h4>Limits of this report</h4><p>{parsed.limitation}</p></div>
        )}
      </section>

      <section className="rsec">
        {SECTION(4, 'Source evidence')}
        {x.sources.length === 0 ? (
          <p className="rsec-p callout">Nothing in the library matched. Add maintenance documents before relying on any diagnosis.</p>
        ) : (
          <ol className="sources">
            {x.sources.map((s) => (
              <li key={s.chunk_id} id={`src-${s.citation.replace(/[^\d]/g, '')}`} className="source">
                <div className="source-top">
                  <span className="cite-static mono">{s.citation.replace(/[\[\]]/g, '')}</span>
                  <div className="source-doc"><b>{s.document_name}</b><small className="mono">page {s.page ?? 'n/a'} · {s.chunk_id}</small></div>
                  <div className="source-score"><span className="mono">{s.score.toFixed(3)}</span><ScoreBar value={s.score} label={`Similarity ${s.score.toFixed(3)}`} /></div>
                </div>
                <p className="source-text">{highlight(s.excerpt, x.question).map((seg, i) => seg.hit ? <mark key={i} className="hit">{seg.text}</mark> : <span key={i}>{seg.text}</span>)}{s.excerpt.length >= 600 ? '…' : ''}</p>
                <a className="link source-open" href={`#/library?doc=${docIdFromChunk(s.chunk_id)}&chunk=${encodeURIComponent(s.chunk_id)}`}>Open in the library</a>
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className="report-foot">
        <p>All telemetry is simulated. Root causes here are hypotheses, not proof. Confirm with a qualified technician before acting on real equipment.</p>
        <div className="report-actions">
          <button className="btn btn-sm" onClick={copy}>{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? 'Copied' : 'Copy as text'}</button>
          <button className="btn btn-sm" onClick={onRerun}><RotateCcw size={14} /> Run again</button>
        </div>
      </footer>
    </article>
  );
}

function Observations({ r }: { r: CaseReport }) {
  const t = r.result.telemetry, b = r.baseline;
  const rows = [
    { k: 'Temperature', unit: '°C', v: t.temperature, d: 1, base: b.base_temp, limit: b.base_temp * WARN_TEMP_FACTOR, kind: 'max' as const, max: b.base_temp * 1.9 },
    { k: 'Vibration', unit: 'mm/s', v: t.vibration, d: 2, base: b.base_vibration, limit: WARN_VIBRATION, kind: 'max' as const, max: 12 },
    { k: 'Pressure', unit: 'bar', v: t.pressure, d: 2, base: b.base_pressure, limit: undefined, kind: 'max' as const, max: b.base_pressure * 1.6 },
    { k: 'Health', unit: '%', v: t.health, d: 0, base: 100, limit: WARN_HEALTH, kind: 'min' as const, max: 100 },
  ];
  return (
    <div className="table-scroll">
      <table className="tbl obs">
        <thead><tr><th>Signal</th><th className="r">Reading</th><th className="r">Baseline</th><th className="r">Change</th><th className="obs-bar-h">Against baseline and limit</th><th>State</th></tr></thead>
        <tbody>
          {rows.map((o) => {
            const beyond = o.limit != null && (o.kind === 'max' ? o.v > o.limit : o.v < o.limit);
            const change = ((o.v - o.base) / o.base) * 100;
            return (
              <tr key={o.k}>
                <td>{o.k}</td>
                <td className="r mono"><b>{fix(o.v, o.d)}</b> {o.unit}</td>
                <td className="r mono">{fix(o.base, o.d === 0 ? 0 : 1)}</td>
                <td className="r mono">{change >= 0 ? '+' : '−'}{Math.abs(change).toFixed(0)}%</td>
                <td className="obs-bar"><Bullet value={o.v} baseline={o.base} limit={o.limit} limitIs={o.kind} max={o.max} label={`${o.k} ${fix(o.v, o.d)} ${o.unit}`} /></td>
                <td>{o.limit == null ? <span className="muted">No limit set</span> : beyond ? <span className="obs-beyond"><StatusGlyph status="warning" /> Beyond limit</span> : <span>Within limit</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="obs-key"><i className="k-base" /> baseline <i className="k-limit" /> warning limit</p>
    </div>
  );
}
