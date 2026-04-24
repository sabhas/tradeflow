import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

export type ComboboxOption = { value: string; label: string };

export type ComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  onQueryChange?: (query: string) => void;
  /**
   * When Enter is pressed, if this returns a string that value is picked instead of the highlighted option.
   * Return `undefined` to use default list selection behavior.
   */
  selectOnEnter?: (input: string) => string | undefined;
  /**
   * Override the text shown in the input immediately after a pick (defaults to the picked option's label).
   * Useful for synthetic rows (e.g. "Add …") where the committed value differs from the row label.
   */
  getInputValueAfterPick?: (
    pickedValue: string,
    option: ComboboxOption | undefined,
    inputSnapshot: string
  ) => string | undefined;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  id?: string;
  name?: string;
  'aria-label'?: string;
  /** Return true if the option should appear for this query. Default: case-insensitive substring on `label`. */
  filter?: (query: string, option: ComboboxOption) => boolean;
};

function defaultFilter(query: string, option: ComboboxOption) {
  const t = query.trim().toLowerCase();
  if (!t) return true;
  return option.label.toLowerCase().includes(t);
}

type ComboboxPortalPosition = { top: number; left: number; width: number; maxHeight: number };

function computePosition(trigger: HTMLElement): ComboboxPortalPosition {
  const rect = trigger.getBoundingClientRect();
  const margin = 8;
  const gap = 4;
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;
  const preferredMax = 240;

  const spaceBelow = viewportH - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  const openBelow = spaceBelow >= 120 || spaceBelow >= spaceAbove;
  let top: number;
  let maxHeight: number;
  if (openBelow) {
    top = rect.bottom + gap;
    maxHeight = Math.min(preferredMax, Math.max(80, spaceBelow - gap));
  } else {
    maxHeight = Math.min(preferredMax, Math.max(80, spaceAbove - gap));
    top = rect.top - maxHeight - gap;
  }
  let left = rect.left;
  const width = rect.width;
  if (left + width > viewportW - margin) {
    left = Math.max(margin, viewportW - width - margin);
  }
  if (left < margin) left = margin;
  return { top, left, width, maxHeight };
}

function getScrollableAncestors(node: HTMLElement | null): HTMLElement[] {
  const out: HTMLElement[] = [];
  let n: HTMLElement | null = node;
  while (n) {
    const s = getComputedStyle(n);
    const o = s.overflow + s.overflowY + s.overflowX;
    if (/(auto|scroll|overlay)/.test(o)) {
      out.push(n);
    }
    n = n.parentElement;
  }
  if (!out.includes(document.documentElement)) {
    out.push(document.documentElement);
  }
  return out;
}

const inputBase =
  'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 pr-8 text-left text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500';

export function Combobox({
  value,
  onChange,
  options,
  onQueryChange,
  selectOnEnter,
  getInputValueAfterPick,
  placeholder = 'Search…',
  disabled,
  className = '',
  inputClassName = '',
  id,
  name,
  'aria-label': ariaLabel,
  filter = defaultFilter,
}: ComboboxProps) {
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);
  const selectedLabel = selected?.label ?? '';

  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [inputValue, setInputValue] = useState(selectedLabel);
  const inputValueRef = useRef(inputValue);
  inputValueRef.current = inputValue;
  const [highlighted, setHighlighted] = useState(0);
  /** Bumped on scroll/resize so we re-measure `getBoundingClientRect` for the fixed portal. */
  const [, setLayoutNonce] = useState(0);
  const bumpLayout = useCallback(() => setLayoutNonce((n) => n + 1), []);

  const filtered = useMemo(
    () => options.filter((o) => filter(inputValue, o)),
    [options, inputValue, filter]
  );

  useEffect(() => {
    if (!focused) {
      setInputValue(selectedLabel);
    }
  }, [focused, selectedLabel]);

  useEffect(() => {
    setHighlighted(0);
  }, [inputValue]);

  useEffect(() => {
    setHighlighted((h) => {
      if (filtered.length === 0) return 0;
      return Math.min(h, filtered.length - 1);
    });
  }, [filtered.length]);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const el = triggerRef.current;
    const run = () => bumpLayout();
    run();
    window.addEventListener('resize', run);
    window.addEventListener('scroll', run, true);
    const scrollParents = getScrollableAncestors(el);
    scrollParents.forEach((p) => p.addEventListener('scroll', run, { passive: true, capture: true }));
    const ro = new ResizeObserver(run);
    ro.observe(el);
    return () => {
      window.removeEventListener('resize', run);
      window.removeEventListener('scroll', run, true);
      scrollParents.forEach((p) => p.removeEventListener('scroll', run, true));
      ro.disconnect();
    };
  }, [open, bumpLayout]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const row = listRef.current.querySelector(`[data-combobox-index="${highlighted}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [highlighted, open]);

  const closeAndRevert = useCallback(() => {
    setOpen(false);
    setInputValue(selectedLabel);
    onQueryChange?.(selectedLabel);
  }, [onQueryChange, selectedLabel]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
      setFocused(false);
      setInputValue(selectedLabel);
      onQueryChange?.(selectedLabel);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open, selectedLabel, onQueryChange]);

  const pick = useCallback(
    (nextValue: string) => {
      onChange(nextValue);
      const next = options.find((o) => o.value === nextValue);
      const snapshot = inputValueRef.current;
      const override = getInputValueAfterPick?.(nextValue, next, snapshot);
      const nextInput = override !== undefined && override !== null ? override : (next?.label ?? '');
      setInputValue(nextInput);
      onQueryChange?.(nextInput);
      setOpen(false);
    },
    [getInputValueAfterPick, onChange, onQueryChange, options]
  );

  const onInputChange = (q: string) => {
    setInputValue(q);
    onQueryChange?.(q);
    setOpen(true);
  };

  const onInputFocus = () => {
    setFocused(true);
    setOpen(true);
  };

  const onInputBlur = () => {
    requestAnimationFrame(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setFocused(false);
        setOpen(false);
        setInputValue(selectedLabel);
        onQueryChange?.(selectedLabel);
      }
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        closeAndRevert();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlighted((h) => (filtered.length === 0 ? 0 : (h + 1) % filtered.length));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlighted((h) => {
        if (filtered.length === 0) return 0;
        return (h - 1 + filtered.length) % filtered.length;
      });
      return;
    }

    if (e.key === 'Enter') {
      const intercepted = selectOnEnter?.(inputValue);
      if (intercepted !== undefined) {
        e.preventDefault();
        pick(intercepted);
        return;
      }
      if (!open || filtered.length === 0) return;
      e.preventDefault();
      const opt = filtered[highlighted];
      if (opt) pick(opt.value);
      return;
    }

    if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const toggleOpen = () => {
    if (disabled) return;
    setOpen((o) => !o);
  };

  const portalPos: ComboboxPortalPosition | null =
    open && !disabled && triggerRef.current ? computePosition(triggerRef.current) : null;

  const listContent =
    open && !disabled && portalPos != null ? (
      <ul
        ref={(node) => {
          listRef.current = node;
        }}
        id={listboxId}
        role="listbox"
        style={{
          position: 'fixed',
          top: portalPos.top,
          left: portalPos.left,
          width: portalPos.width,
          maxHeight: portalPos.maxHeight,
        }}
        className="z-[100] min-w-[12rem] box-border overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
      >
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No matches</li>
        ) : (
          filtered.map((opt, i) => {
            const active = i === highlighted;
            return (
              <li
                key={opt.value === '' ? '__empty__' : opt.value}
                id={`${listboxId}-opt-${i}`}
                role="option"
                aria-selected={active}
                data-combobox-index={i}
                className={`cursor-pointer px-3 py-1.5 text-sm ${
                  active
                    ? 'bg-indigo-600 text-white dark:bg-indigo-600'
                    : 'text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
                onMouseEnter={() => setHighlighted(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={() => pick(opt.value)}
              >
                {opt.label || '—'}
              </li>
            );
          })
        )}
      </ul>
    ) : null;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div ref={triggerRef} className="relative flex items-stretch">
        <input
          id={id}
          name={name}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            open && filtered[highlighted] ? `${listboxId}-opt-${highlighted}` : undefined
          }
          aria-label={ariaLabel}
          disabled={disabled}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={placeholder}
          className={`${inputBase} disabled:cursor-not-allowed disabled:opacity-50 ${inputClassName}`}
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onFocus={onInputFocus}
          onBlur={onInputBlur}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={open ? 'Close suggestions' : 'Open suggestions'}
          className="absolute right-0 top-0 flex h-full w-8 shrink-0 items-center justify-center rounded-r-md border border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={() => {
            toggleOpen();
            if (!open) {
              setFocused(true);
            }
          }}
        >
          <span className="pointer-events-none text-xs" aria-hidden>
            ▾
          </span>
        </button>
      </div>

      {typeof document !== 'undefined' && listContent != null
        ? createPortal(listContent, document.body)
        : null}
    </div>
  );
}
