import { useSyncExternalStore } from 'react';

/**
 * Backend base URL. Override with VITE_API_BASE (see frontend/.env.example).
 * Only VITE_-prefixed variables are exposed to the browser, so no secret can leak through here.
 */
export const API_BASE: string =
  ((import.meta.env.VITE_API_BASE as string | undefined) || 'http://127.0.0.1:8000/api').replace(/\/+$/, '');

export class ApiError extends Error {
  status: number;
  network: boolean;
  constructor(message: string, status: number, network = false) {
    super(message);
    this.status = status;
    this.network = network;
  }
}

/* ------------------------------------------------------------------ request log */
export interface LogEntry {
  id: number;
  at: number;
  method: string;
  path: string;
  status: number | 'ERR';
  ms: number;
  poll: boolean;
}

const LOG_MAX = 80;
let logSeq = 0;
let log: LogEntry[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function record(entry: Omit<LogEntry, 'id'>) {
  log = [{ ...entry, id: ++logSeq }, ...log].slice(0, LOG_MAX);
  emit();
}

export function useRequestLog(): LogEntry[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => log,
    () => log,
  );
}

/* ------------------------------------------------------------------ fetch wrapper */
export interface ReqOpts {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  poll?: boolean;
}

export async function api<T>(path: string, opts: ReqOpts = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const started = performance.now();
  const init: RequestInit = { method, signal: opts.signal };
  if (opts.body instanceof FormData) init.body = opts.body;
  else if (opts.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(API_BASE + path, init);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    record({ at: Date.now(), method, path, status: 'ERR', ms: Math.round(performance.now() - started), poll: !!opts.poll });
    throw new ApiError('Cannot reach the backend. Is the FastAPI server running?', 0, true);
  }
  record({ at: Date.now(), method, path, status: res.status, ms: Math.round(performance.now() - started), poll: !!opts.poll });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    const detail = j && typeof j.detail === 'string' ? j.detail : res.statusText || 'Request failed';
    throw new ApiError(detail, res.status);
  }
  return (await res.json()) as T;
}

/**
 * Multipart upload via XMLHttpRequest, because fetch cannot report upload progress.
 * `onUploaded` fires when the bytes are sent; the remaining wait is the server indexing the file.
 */
export function uploadDocument(file: File, onProgress: (fraction: number) => void, onUploaded: () => void) {
  return new Promise<{ status: string; document_id: string; filename: string }>((resolve, reject) => {
    const started = performance.now();
    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_BASE + '/documents/upload');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.upload.onload = () => onUploaded();
    xhr.onerror = () => {
      record({ at: Date.now(), method: 'POST', path: '/documents/upload', status: 'ERR', ms: Math.round(performance.now() - started), poll: false });
      reject(new ApiError('Cannot reach the backend. Is the FastAPI server running?', 0, true));
    };
    xhr.onload = () => {
      record({ at: Date.now(), method: 'POST', path: '/documents/upload', status: xhr.status, ms: Math.round(performance.now() - started), poll: false });
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error body */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new ApiError(body && typeof body.detail === 'string' ? body.detail : 'Upload failed', xhr.status));
    };
    const fd = new FormData();
    fd.append('file', file);
    xhr.send(fd);
  });
}
