import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { CaseReport, EvalStoredRun, SearchHit } from '../lib/types';

export type ToastKind = 'ok' | 'error' | 'info';
export interface Toast { id: number; kind: ToastKind; message: string }

interface SessionCtx {
  toasts: Toast[];
  toast: (kind: ToastKind, message: string) => void;
  dismissToast: (id: number) => void;

  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;

  // Investigator: reports live here so they survive navigation (in memory only; cleared on reload).
  reports: CaseReport[];
  activeReport: string | null;
  addReport: (r: CaseReport) => void;
  nextRef: () => string;
  setActiveReport: (k: string | null) => void;
  draftQuestion: string;
  setDraftQuestion: (q: string) => void;

  // Evaluation: every run in this browser session, newest first.
  evalRuns: EvalStoredRun[];
  addEvalRun: (r: EvalStoredRun) => void;

  // Library search state.
  search: { query: string; hits: SearchHit[] | null; ranFor: string };
  setSearch: (s: { query: string; hits: SearchHit[] | null; ranFor: string }) => void;
}

const Ctx = createContext<SessionCtx | null>(null);
export const useSession = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('SessionProvider missing');
  return c;
};

export const DEFAULT_QUESTION = 'Why is the conveyor vibrating excessively and overheating?';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((kind: ToastKind, message: string) => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    window.setTimeout(() => dismissToast(id), kind === 'error' ? 6500 : 3800);
  }, [dismissToast]);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [reports, setReports] = useState<CaseReport[]>([]);
  const [activeReport, setActiveReport] = useState<string | null>(null);
  const [draftQuestion, setDraftQuestion] = useState(DEFAULT_QUESTION);
  const refSeq = useRef(0);
  const nextRef = useCallback(() => `RPT-${String(++refSeq.current).padStart(3, '0')}`, []);
  const addReport = useCallback((r: CaseReport) => {
    setReports((x) => [r, ...x].slice(0, 12));
    setActiveReport(r.key);
  }, []);

  const [evalRuns, setEvalRuns] = useState<EvalStoredRun[]>([]);
  const addEvalRun = useCallback((r: EvalStoredRun) => setEvalRuns((x) => [r, ...x].slice(0, 10)), []);

  const [search, setSearch] = useState<SessionCtx['search']>({ query: 'conveyor vibration bearing', hits: null, ranFor: '' });

  const value = useMemo<SessionCtx>(
    () => ({ toasts, toast, dismissToast, paletteOpen, setPaletteOpen, reports, activeReport, addReport, nextRef, setActiveReport, draftQuestion, setDraftQuestion, evalRuns, addEvalRun, search, setSearch }),
    [toasts, toast, dismissToast, paletteOpen, reports, activeReport, addReport, nextRef, draftQuestion, evalRuns, addEvalRun, search],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
