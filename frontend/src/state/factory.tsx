import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from '../lib/api';
import type { Dependencies, Doc, Incident, Machine, Overview, Sample, SystemStatus } from '../lib/types';
import { useSession } from './session';

const POLL_MS = 2000; // matches the engine's tick (SIMULATION_TICK_SECONDS default)
const SLOW_MS = 8000;

export type Link = 'connecting' | 'online' | 'offline';

interface FactoryCtx {
  link: Link;
  /** True once at least one poll has succeeded, so we can show stale data instead of an empty screen when the link drops. */
  hasData: boolean;
  lastOk: number | null;
  latency: number | null;
  error: string | null;
  overview: Overview | null;
  machines: Machine[];
  incidents: Incident[];
  telemetry: Record<string, Sample[]>;
  system: SystemStatus | null;
  docs: Doc[];
  deps: Dependencies | null;
  selectedId: string;
  selected: Machine | undefined;
  select: (id: string) => void;
  busy: boolean;
  refresh: () => Promise<void>;
  /** POST to the simulation API, then refresh. Returns the response, or null if the call failed (a toast is shown). */
  act: <T = unknown>(path: string, body: unknown, okMessage: string) => Promise<T | null>;
  retry: () => void;
}

const Ctx = createContext<FactoryCtx | null>(null);
export const useFactory = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('FactoryProvider missing');
  return c;
};

export function FactoryProvider({ children }: { children: ReactNode }) {
  const { toast } = useSession();
  const [link, setLink] = useState<Link>('connecting');
  const [hasData, setHasData] = useState(false);
  const [lastOk, setLastOk] = useState<number | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [telemetry, setTelemetry] = useState<Record<string, Sample[]>>({});
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [deps, setDeps] = useState<Dependencies | null>(null);
  const [selectedId, setSelectedId] = useState('M-01');
  const [busy, setBusy] = useState(false);
  const inflight = useRef(false);
  const failures = useRef(0);

  const fast = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    const t0 = performance.now();
    try {
      const [o, m, i] = await Promise.all([
        api<Overview>('/factory/overview', { poll: true }),
        api<Machine[]>('/machines', { poll: true }),
        api<Incident[]>('/incidents', { poll: true }),
      ]);
      const tele = await Promise.all(m.map((x) => api<Sample[]>(`/machines/${x.id}/telemetry`, { poll: true })));
      setLatency(Math.round(performance.now() - t0));
      setOverview(o);
      setMachines(m);
      setIncidents(i);
      setTelemetry(Object.fromEntries(m.map((x, k) => [x.id, tele[k]])));
      setSelectedId((cur) => (m.some((x) => x.id === cur) || !m.length ? cur : m[0].id));
      failures.current = 0;
      setLastOk(Date.now());
      setError(null);
      setHasData(true);
      setLink('online');
    } catch (e) {
      failures.current += 1;
      setError(e instanceof ApiError ? e.message : 'Unexpected error while polling the backend.');
      setLink('offline');
    } finally {
      inflight.current = false;
    }
  }, []);

  const slow = useCallback(async () => {
    try {
      const [s, d, g] = await Promise.all([
        api<SystemStatus>('/system/status', { poll: true }),
        api<Doc[]>('/documents', { poll: true }),
        api<Dependencies>('/dependencies', { poll: true }),
      ]);
      setSystem(s);
      setDocs(d);
      setDeps(g);
    } catch {
      /* the fast poll owns connection state */
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([fast(), slow()]);
  }, [fast, slow]);

  useEffect(() => {
    refresh();
    const a = window.setInterval(() => !document.hidden && fast(), POLL_MS);
    const b = window.setInterval(() => !document.hidden && slow(), SLOW_MS);
    const vis = () => !document.hidden && refresh();
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.clearInterval(a);
      window.clearInterval(b);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [fast, slow, refresh]);

  const act = useCallback(
    async <T,>(path: string, body: unknown, okMessage: string) => {
      setBusy(true);
      try {
        const r = await api<T>(path, { method: 'POST', body });
        await refresh();
        toast('ok', okMessage);
        return r;
      } catch (e) {
        toast('error', e instanceof Error ? e.message : 'Request failed');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [refresh, toast],
  );

  const retry = useCallback(() => {
    setLink('connecting');
    refresh();
  }, [refresh]);

  const selected = machines.find((m) => m.id === selectedId) ?? machines[0];

  const value = useMemo<FactoryCtx>(
    () => ({ link, hasData, lastOk, latency, error, overview, machines, incidents, telemetry, system, docs, deps, selectedId, selected, select: setSelectedId, busy, refresh, act, retry }),
    [link, hasData, lastOk, latency, error, overview, machines, incidents, telemetry, system, docs, deps, selectedId, selected, busy, refresh, act, retry],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
