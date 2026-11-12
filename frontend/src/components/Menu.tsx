import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface MenuOption<T extends string> { value: T; label: string; hint?: string }

interface Props<T extends string> {
  value: T;
  options: MenuOption<T>[];
  onChange: (v: T) => void;
  ariaLabel: string;
  align?: 'left' | 'right';
  className?: string;
}

/** Listbox-style dropdown with keyboard support (arrows, Home/End, Enter, Esc, type to jump). */
export function Menu<T extends string>({ value, options, onChange, ariaLabel, align = 'left', className = '' }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const on = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('pointerdown', on);
    return () => document.removeEventListener('pointerdown', on);
  }, [open]);

  const openMenu = () => { setActive(Math.max(0, options.findIndex((o) => o.value === value))); setOpen(true); };
  const choose = (i: number) => { onChange(options[i].value); setOpen(false); root.current?.querySelector<HTMLElement>('button')?.focus(); };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openMenu(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % options.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + options.length) % options.length); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape' || e.key === 'Tab') { setOpen(false); }
    else if (e.key.length === 1) {
      const i = options.findIndex((o) => o.label.toLowerCase().startsWith(e.key.toLowerCase()));
      if (i >= 0) setActive(i);
    }
  };

  return (
    <div ref={root} className={`menu ${className}`} onKeyDown={onKey}>
      <button type="button" className="menu-btn" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} aria-label={`${ariaLabel}: ${current.label}`} onClick={() => (open ? setOpen(false) : openMenu())}>
        <span>{current.label}</span>
        <ChevronDown size={14} className="menu-chev" />
      </button>
      {open && (
        <ul id={`${id}-list`} className={`menu-list align-${align}`} role="listbox" aria-label={ariaLabel} aria-activedescendant={`${id}-o${active}`}>
          {options.map((o, i) => (
            <li key={o.value} id={`${id}-o${i}`} role="option" aria-selected={o.value === value} className={`menu-opt ${i === active ? 'is-active' : ''}`} onPointerEnter={() => setActive(i)} onClick={() => choose(i)}>
              <span className="menu-check">{o.value === value && <Check size={14} />}</span>
              <span className="menu-text"><span>{o.label}</span>{o.hint && <small>{o.hint}</small>}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
