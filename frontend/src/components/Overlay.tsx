import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useSession } from '../state/session';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  className?: string;
  /** "top" pins the panel near the top of the screen (command palette). */
  place?: 'center' | 'top';
}

/** Dialog with focus trap, Escape/backdrop close, focus restore, and an exit transition. */
export function Modal({ open, onClose, label, children, className = '', place = 'center' }: ModalProps) {
  const [mounted, setMounted] = useState(open);
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) { setMounted(true); setPhase('in'); return; }
    if (!mounted) return;
    setPhase('out');
    const t = window.setTimeout(() => setMounted(false), 150);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !mounted) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    const el = panel.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el)?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      returnTo.current?.focus?.();
    };
  }, [open, mounted]);

  if (!mounted) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab' || !panel.current) return;
    const nodes = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
    if (!nodes.length) return;
    const first = nodes[0], last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return createPortal(
    <div className={`modal-root place-${place} phase-${phase}`} onKeyDown={onKey}>
      <div className="modal-backdrop" onClick={onClose} />
      <div ref={panel} className={`modal-panel ${className}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, body, confirmLabel, tone = 'danger', busy, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Modal open={open} onClose={onCancel} label={title} className="confirm">
      <h2 className="confirm-title">{title}</h2>
      <div className="confirm-body">{body}</div>
      <div className="confirm-actions">
        <button className="btn" onClick={onCancel} data-autofocus>Cancel</button>
        <button className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useSession();
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          <span className="toast-mark" aria-hidden="true" />
          <span className="toast-msg">{t.message}</span>
          <button className="toast-x" onClick={() => dismissToast(t.id)} aria-label="Dismiss notification"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}
