import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, FileText, Search, Trash2, Upload } from 'lucide-react';
import { ScoreBar } from '../components/Meters';
import { ConfirmDialog } from '../components/Overlay';
import { PageHead, SectionHead } from '../components/PageHead';
import { EmptyState, Skeleton } from '../components/States';
import { api, uploadDocument } from '../lib/api';
import { replaceRoute, useRoute } from '../lib/router';
import { sqliteDate } from '../lib/format';
import { highlight, splitHeadings } from '../lib/text';
import type { Doc, DocumentChunks, SearchHit } from '../lib/types';
import { useFactory } from '../state/factory';
import { useSession } from '../state/session';

type Upload =
  | { phase: 'idle' }
  | { phase: 'uploading'; name: string; pct: number }
  | { phase: 'indexing'; name: string }
  | { phase: 'error'; message: string };

const EXAMPLES = ['conveyor vibration bearing', 'spindle lubrication', 'emergency stop sensor', 'lockout tagout before inspection'];

export function Library() {
  const { query } = useRoute();
  const { docs, system, refresh } = useFactory();
  const { toast, search, setSearch } = useSession();
  const [view, setView] = useState<{ docId: string | null; chunkId: string | null }>({ docId: null, chunkId: null });
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [up, setUp] = useState<Upload>({ phase: 'idle' });
  const [drag, setDrag] = useState(false);
  const [confirm, setConfirm] = useState<Doc | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const runSearch = useCallback(async (q: string) => {
    const text = q.trim();
    if (!text) return;
    setSearching(true); setSearchError(null);
    try {
      const r = await api<{ results: SearchHit[] }>('/knowledge/search', { method: 'POST', body: { query: text, top_k: 8 } });
      setSearch({ query: text, hits: r.results, ranFor: text });
      setView({ docId: null, chunkId: null });
    } catch (e) { setSearchError(e instanceof Error ? e.message : 'Search failed'); }
    finally { setSearching(false); }
  }, [setSearch]);

  // Deep links: ?doc=&chunk= opens the document preview, ?q= runs a search.
  const qDoc = query.get('doc'), qChunk = query.get('chunk'), qQ = query.get('q');
  useEffect(() => {
    if (qDoc) { setView({ docId: qDoc, chunkId: qChunk }); replaceRoute('/library'); }
    else if (qQ) { setSearch({ query: qQ, hits: null, ranFor: '' }); runSearch(qQ); replaceRoute('/library'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qDoc, qChunk, qQ]);

  async function handleFile(file?: File | null) {
    if (!file) return;
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext !== 'pdf' && ext !== 'txt') { setUp({ phase: 'error', message: `“${file.name}” is not supported. Choose a PDF or TXT file.` }); return; }
    if (file.size === 0) { setUp({ phase: 'error', message: `“${file.name}” is empty.` }); return; }
    setUp({ phase: 'uploading', name: file.name, pct: 0 });
    try {
      const r = await uploadDocument(file, (f) => setUp({ phase: 'uploading', name: file.name, pct: f }), () => setUp({ phase: 'indexing', name: file.name }));
      await refresh();
      setUp({ phase: 'idle' });
      setFresh(r.document_id);
      window.setTimeout(() => setFresh(null), 3500);
      toast('ok', `${file.name} indexed`);
    } catch (e) { setUp({ phase: 'error', message: e instanceof Error ? e.message : 'Upload failed' }); }
    finally { if (fileRef.current) fileRef.current.value = ''; }
  }

  async function doDelete() {
    if (!confirm) return;
    setDeleting(true);
    try {
      await api(`/documents/${confirm.id}`, { method: 'DELETE' });
      await refresh();
      if (view.docId === confirm.id) setView({ docId: null, chunkId: null });
      toast('ok', `${confirm.name} removed`);
      setConfirm(null);
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Could not delete'); }
    finally { setDeleting(false); }
  }

  const busyUp = up.phase === 'uploading' || up.phase === 'indexing';
  const maxChunks = Math.max(1, ...docs.map((d) => d.chunks));

  return (
    <>
      <PageHead
        title="Library"
        lead="Maintenance manuals and incident reports, split into passages and indexed so the investigator can cite them."
        spec={[
          { k: 'Documents', v: system?.documents_indexed ?? docs.length },
          { k: 'Passages', v: system?.chunks_indexed ?? '–' },
          { k: 'Vector store', v: system ? (system.vector_database.includes('Chroma') ? 'ChromaDB' : 'SQLite fallback') : '–' },
          { k: 'Embeddings', v: system ? (system.embedding_model.includes('Sentence') ? 'MiniLM-L6' : 'Hash fallback') : '–' },
        ]}
      />

      <div className="lib-grid">
        <section className="lib-left" aria-label="Documents">
          <SectionHead title="Documents" note="PDF and TXT. Files are stored in the backend's data folder." />

          <div
            className={`dropzone ${drag ? 'is-drag' : ''} ${busyUp ? 'is-busy' : ''} ${up.phase === 'error' ? 'is-error' : ''}`}
            onDragOver={(e) => { e.preventDefault(); if (!busyUp) setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busyUp) handleFile(e.dataTransfer.files?.[0]); }}
          >
            {up.phase === 'uploading' && (
              <div className="drop-state" role="status">
                <b>Uploading {up.name}</b>
                <div className="progress" role="progressbar" aria-valuenow={Math.round(up.pct * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${up.pct * 100}%` }} /></div>
                <span className="mono">{Math.round(up.pct * 100)}%</span>
              </div>
            )}
            {up.phase === 'indexing' && (
              <div className="drop-state" role="status">
                <b>Indexing {up.name}</b>
                <div className="progress is-indeterminate" role="progressbar" aria-label="Indexing"><i /></div>
                <span className="muted">Splitting into passages and computing embeddings. The first run can take a while.</span>
              </div>
            )}
            {(up.phase === 'idle' || up.phase === 'error') && (
              <div className="drop-idle">
                <Upload size={22} aria-hidden="true" />
                <p><b>{drag ? 'Release to upload' : 'Drop a PDF or TXT file here'}</b></p>
                <label className="btn btn-sm">
                  Choose a file
                  <input ref={fileRef} type="file" accept=".pdf,.txt,application/pdf,text/plain" className="sr-only" onChange={(e) => handleFile(e.target.files?.[0])} />
                </label>
                {up.phase === 'error' && <p className="field-error" role="alert">{up.message}</p>}
              </div>
            )}
          </div>

          {docs.length === 0 ? (
            <EmptyState title="No documents indexed" mark="doc">Upload a maintenance manual and it will be searchable here and citable in investigations.</EmptyState>
          ) : (
            <ul className="docs">
              {docs.map((d) => (
                <li key={d.id} className={`doc ${view.docId === d.id ? 'is-open' : ''} ${fresh === d.id ? 'is-fresh' : ''}`}>
                  <button className="doc-main" onClick={() => setView({ docId: d.id, chunkId: null })} aria-pressed={view.docId === d.id}>
                    <span className={`doc-kind mono kind-${d.kind}`}>{d.kind}</span>
                    <span className="doc-text">
                      <b>{d.name}</b>
                      <small>{d.chunks} {d.chunks === 1 ? 'passage' : 'passages'} · added {sqliteDate(d.created_at)}</small>
                      <span className="doc-bar" aria-hidden="true">{Array.from({ length: d.chunks }, (_, i) => <i key={i} style={{ width: `${100 / maxChunks}%` }} />)}</span>
                    </span>
                  </button>
                  <button className="btn btn-ghost btn-icon doc-del" onClick={() => setConfirm(d)} aria-label={`Remove ${d.name}`}><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="lib-right" aria-label="Search and preview">
          {view.docId ? (
            <Preview docId={view.docId} chunkId={view.chunkId} query={search.ranFor} onBack={() => setView({ docId: null, chunkId: null })} onMissing={() => setView({ docId: null, chunkId: null })} />
          ) : (
            <>
              <SectionHead title="Search the library" note="Finds passages by meaning, so symptoms and plain wording work as well as exact terms." />
              <form className="searchbar" role="search" onSubmit={(e) => { e.preventDefault(); runSearch(search.query); }}>
                <Search size={17} aria-hidden="true" />
                <input className="searchbar-input" value={search.query} onChange={(e) => setSearch({ ...search, query: e.target.value })} placeholder="Describe a symptom, a part or a procedure" aria-label="Search query" />
                <button className="btn btn-primary" type="submit" disabled={searching || !search.query.trim()}>{searching ? 'Searching…' : 'Search'}</button>
              </form>
              <div className="chips">
                {EXAMPLES.map((x) => <button key={x} className="chip" onClick={() => { setSearch({ query: x, hits: null, ranFor: '' }); runSearch(x); }}>{x}</button>)}
              </div>

              <div className="results" aria-live="polite">
                {searching && <div className="rel-skel"><Skeleton h={96} /><Skeleton h={96} /><Skeleton h={96} /></div>}
                {searchError && <EmptyState title="Search failed" mark="search">{searchError}</EmptyState>}
                {!searching && !searchError && search.hits === null && <EmptyState title="Nothing searched yet" mark="search">Type a query or pick an example. Results show the passage, where it came from, and how similar it is.</EmptyState>}
                {!searching && !searchError && search.hits && search.hits.length === 0 && <EmptyState title="No passages to search" mark="doc">The library is empty. Upload a document first.</EmptyState>}
                {!searching && search.hits && search.hits.length > 0 && (
                  <>
                    <p className="results-meta mono">{search.hits.length} passages for “{search.ranFor}”, most similar first</p>
                    <ol>
                      {search.hits.map((h, i) => <Result key={h.chunk_id} h={h} q={search.ranFor} rank={i + 1} onOpen={() => setView({ docId: h.document_id, chunkId: h.chunk_id })} />)}
                    </ol>
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!confirm}
        title="Remove this document?"
        confirmLabel="Remove document"
        busy={deleting}
        onCancel={() => setConfirm(null)}
        onConfirm={doDelete}
        body={<>
          <p><b className="mono">{confirm?.name}</b> and its {confirm?.chunks} indexed {confirm?.chunks === 1 ? 'passage' : 'passages'} will be deleted, along with any uploaded copy.</p>
          <p className="confirm-note">Bundled sample documents are indexed again the next time the backend starts.</p>
        </>}
      />
    </>
  );
}

function Result({ h, q, rank, onOpen }: { h: SearchHit; q: string; rank: number; onOpen: () => void }) {
  const [open, setOpen] = useState(false);
  const long = h.text.length > 360;
  const text = open || !long ? h.text : h.text.slice(0, 360) + '…';
  return (
    <li className="result">
      <div className="result-top">
        <span className="result-rank mono">{rank}</span>
        <div className="result-doc"><b>{h.document_name}</b><small className="mono">page {h.page ?? 'n/a'} · {h.chunk_id}</small></div>
        <div className="result-score"><span className="mono">{h.score.toFixed(3)}</span><ScoreBar value={Math.max(0, h.score)} label={`Similarity ${h.score.toFixed(3)}`} /></div>
      </div>
      <p className="result-text">{highlight(text, q).map((s, i) => s.hit ? <mark key={i} className="hit">{s.text}</mark> : <span key={i}>{s.text}</span>)}</p>
      <div className="result-actions">
        <button className="link" onClick={onOpen}>Open in document</button>
        {long && <button className="link" onClick={() => setOpen(!open)}>{open ? 'Show less' : 'Show full passage'}</button>}
      </div>
    </li>
  );
}

function Preview({ docId, chunkId, query, onBack, onMissing }: { docId: string; chunkId: string | null; query: string; onBack: () => void; onMissing: () => void }) {
  const [data, setData] = useState<DocumentChunks | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    setData(null); setErr(null);
    api<DocumentChunks>(`/documents/${docId}/chunks`, { signal: ctl.signal })
      .then(setData)
      .catch((e) => { if (e.name === 'AbortError') return; if (e.status === 404) onMissing(); else setErr(e.message); });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  useEffect(() => {
    if (data && chunkId) window.setTimeout(() => targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
  }, [data, chunkId]);

  const parts = useMemo(() => data?.chunks.map((c) => ({ c, parts: splitHeadings(c.text) })) ?? [], [data]);

  return (
    <div className="preview">
      <button className="btn btn-sm btn-ghost preview-back" onClick={onBack}><ArrowLeft size={14} /> Back to search</button>
      {err && <EmptyState title="Could not load the document" mark="doc">{err}</EmptyState>}
      {!data && !err && <div className="rel-skel"><Skeleton h={60} w="50%" /><Skeleton h={240} /></div>}
      {data && (
        <article className="sheet preview-sheet reg">
          <header className="preview-head">
            <FileText size={20} aria-hidden="true" />
            <div>
              <h2 className="mono">{data.document.name}</h2>
              <p>{data.document.kind.toUpperCase()} · {data.chunks.length} {data.chunks.length === 1 ? 'passage' : 'passages'} · added {sqliteDate(data.document.created_at)}</p>
            </div>
          </header>
          <ol className="chunks">
            {parts.map(({ c, parts: ps }, i) => {
              const target = c.chunk_id === chunkId;
              return (
                <li key={c.chunk_id} ref={target ? (el) => { targetRef.current = el; } : undefined} className={`chunk ${target ? 'is-target' : ''}`}>
                  <div className="chunk-meta mono"><span>Passage {i + 1}</span><span>page {c.page ?? 'n/a'}</span><span>{c.chunk_id}</span>{target && <b>Cited passage</b>}</div>
                  {ps.map((p, k) => (
                    <div key={k}>
                      {p.heading && <h3 className="chunk-h">{p.heading.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase())}</h3>}
                      <p>{highlight(p.body, query).map((s, j) => s.hit ? <mark key={j} className="hit">{s.text}</mark> : <span key={j}>{s.text}</span>)}</p>
                    </div>
                  ))}
                </li>
              );
            })}
          </ol>
          <p className="preview-foot">Passages overlap slightly where the indexer split long text, so a sentence may appear at the end of one passage and the start of the next.</p>
        </article>
      )}
    </div>
  );
}
