import { useVirtualizer } from '@tanstack/react-virtual';
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
  /** When true, empty-value options (e.g. "All") stay visible while searching. Default: true. */
  pinEmptyOptions?: boolean;
};

function defaultFilter(query: string, option: ComboboxOption) {
  const t = query.trim().toLowerCase();
  if (!t) return true;
  return option.label.toLowerCase().includes(t);
}

function buildFilteredOptions(
  options: ComboboxOption[],
  listQuery: string,
  filter: (query: string, option: ComboboxOption) => boolean,
  pinEmptyOptions: boolean
): ComboboxOption[] {
  if (!listQuery.trim()) return options;
  const sentinels = pinEmptyOptions ? options.filter((o) => o.value === '') : [];
  const rest = options.filter((o) => o.value !== '' && filter(listQuery, o));
  return [...sentinels, ...rest];
}

type ComboboxPortalPosition = { top: number; left: number; width: number; maxHeight: number };

const VIRTUAL_THRESHOLD = 40;
const ROW_HEIGHT = 36;

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

const optionRowClass = (active: boolean) =>
  `cursor-pointer px-3 py-1.5 text-sm ${
    active
      ? 'bg-indigo-600 text-white dark:bg-indigo-600'
      : 'text-slate-800 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800'
  }`;

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
  pinEmptyOptions = true,
}: ComboboxProps) {
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);
  const selectedLabel = selected?.label ?? '';

  const [open, setOpen] = useState(false);
  /** Search text while the dropdown is open; empty on open shows the full list. */
  const [listQuery, setListQuery] = useState('');
  const listQueryRef = useRef(listQuery);
  listQueryRef.current = listQuery;
  const [highlighted, setHighlighted] = useState(0);
  /** Optional override for closed input text after pick (see getInputValueAfterPick). */
  const [closedDisplayOverride, setClosedDisplayOverride] = useState<string | null>(null);
  const [, setLayoutNonce] = useState(0);
  const bumpLayout = useCallback(() => setLayoutNonce((n) => n + 1), []);

  useEffect(() => {
    setClosedDisplayOverride(null);
  }, [value]);

  const filtered = useMemo(
    () => buildFilteredOptions(options, listQuery, filter, pinEmptyOptions),
    [options, listQuery, filter, pinEmptyOptions]
  );

  const useVirtualList = filtered.length > VIRTUAL_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const inputDisplay = open ? listQuery : (closedDisplayOverride ?? selectedLabel);

  const resetListQuery = useCallback(() => {
    setListQuery('');
    onQueryChange?.('');
  }, [onQueryChange]);

  const openPanel = useCallback(() => {
    resetListQuery();
    setOpen(true);
  }, [resetListQuery]);

  useEffect(() => {
    setHighlighted(0);
  }, [listQuery]);

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
    if (!open) return;
    if (useVirtualList) {
      virtualizer.scrollToIndex(highlighted, { align: 'auto' });
      return;
    }
    const row = listRef.current?.querySelector(`[data-combobox-index="${highlighted}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [highlighted, open, useVirtualList, virtualizer]);

  const closeAndRevert = useCallback(() => {
    setOpen(false);
    setListQuery('');
    onQueryChange?.('');
  }, [onQueryChange]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
      setListQuery('');
      onQueryChange?.('');
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open, onQueryChange]);

  const pick = useCallback(
    (nextValue: string) => {
      onChange(nextValue);
      const next = options.find((o) => o.value === nextValue);
      const snapshot = listQueryRef.current;
      const override = getInputValueAfterPick?.(nextValue, next, snapshot);
      if (override !== undefined && override !== null) {
        setClosedDisplayOverride(override);
      } else {
        setClosedDisplayOverride(null);
      }
      setListQuery('');
      onQueryChange?.('');
      setOpen(false);
    },
    [getInputValueAfterPick, onChange, onQueryChange, options]
  );

  const onInputChange = (q: string) => {
    setListQuery(q);
    onQueryChange?.(q);
    setOpen(true);
  };

  const onInputFocus = () => {
    openPanel();
  };

  const onInputBlur = () => {
    requestAnimationFrame(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setOpen(false);
        setListQuery('');
        onQueryChange?.('');
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
      if (!open) openPanel();
      setHighlighted((h) => (filtered.length === 0 ? 0 : (h + 1) % filtered.length));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) openPanel();
      setHighlighted((h) => {
        if (filtered.length === 0) return 0;
        return (h - 1 + filtered.length) % filtered.length;
      });
      return;
    }

    if (e.key === 'Enter') {
      const intercepted = selectOnEnter?.(listQuery);
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
    if (open) {
      setOpen(false);
      setListQuery('');
      onQueryChange?.('');
    } else {
      openPanel();
    }
  };

  const portalPos: ComboboxPortalPosition | null =
    open && !disabled && triggerRef.current ? computePosition(triggerRef.current) : null;

  const renderOption = (opt: ComboboxOption, i: number) => {
    const active = i === highlighted;
    return (
      <div
        key={opt.value === '' ? '__empty__' : opt.value}
        id={`${listboxId}-opt-${i}`}
        role="option"
        aria-selected={active}
        data-combobox-index={i}
        className={optionRowClass(active)}
        onMouseEnter={() => setHighlighted(i)}
        onMouseDown={(e) => {
          e.preventDefault();
        }}
        onClick={() => pick(opt.value)}
      >
        {opt.label || '—'}
      </div>
    );
  };

  const listContent =
    open && !disabled && portalPos != null ? (
      <div
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
          <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">No matches</div>
        ) : useVirtualList ? (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const opt = filtered[vi.index];
              if (!opt) return null;
              const active = vi.index === highlighted;
              return (
                <div
                  key={opt.value === '' ? '__empty__' : opt.value}
                  id={`${listboxId}-opt-${vi.index}`}
                  role="option"
                  aria-selected={active}
                  data-combobox-index={vi.index}
                  className={optionRowClass(active)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${vi.size}px`,
                    transform: `translateY(${vi.start}px)`,
                  }}
                  onMouseEnter={() => setHighlighted(vi.index)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                  }}
                  onClick={() => pick(opt.value)}
                >
                  {opt.label || '—'}
                </div>
              );
            })}
          </div>
        ) : (
          filtered.map((opt, i) => renderOption(opt, i))
        )}
      </div>
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
          value={inputDisplay}
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
