import { forwardRef, useRef } from 'react';
import type { InputHTMLAttributes, MouseEvent, MutableRefObject, Ref } from 'react';

type DatePickerInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === 'function') {
    ref(value);
    return;
  }
  (ref as MutableRefObject<T | null>).current = value;
}

export const DatePickerInput = forwardRef<HTMLInputElement, DatePickerInputProps>(function DatePickerInput(
  { className = '', disabled, readOnly, onClick, ...props },
  forwardedRef,
) {
  const localRef = useRef<HTMLInputElement | null>(null);

  const setRefs = (node: HTMLInputElement | null) => {
    localRef.current = node;
    assignRef(forwardedRef, node);
  };

  const openPicker = () => {
    const input = localRef.current;
    if (!input || disabled || readOnly) return;
    try {
      const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
      if (typeof pickerInput.showPicker === 'function') {
        pickerInput.showPicker();
      } else {
        input.focus();
      }
    } catch {
      input.focus();
    }
  };

  const handleInputClick = (event: MouseEvent<HTMLInputElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    openPicker();
  };

  return (
    <div className="relative">
      <input
        {...props}
        ref={setRefs}
        type="date"
        disabled={disabled}
        readOnly={readOnly}
        onClick={handleInputClick}
        className={`${className} pr-9`}
      />
      <button
        type="button"
        className="absolute inset-y-0 right-2 inline-flex items-center text-slate-400 transition hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-500 dark:hover:text-slate-300"
        onMouseDown={(event) => event.preventDefault()}
        onClick={openPicker}
        aria-label="Open date picker"
        disabled={disabled || readOnly}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M8 2v4M16 2v4M3 10h18" />
          <rect x="3" y="4" width="18" height="18" rx="2" />
        </svg>
      </button>
    </div>
  );
});
