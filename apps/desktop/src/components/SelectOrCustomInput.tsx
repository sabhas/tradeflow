import { useCallback, useMemo, useState } from 'react';
import { Combobox, type ComboboxOption } from './Combobox';

export const CUSTOM_OPTION_VALUE = '__custom__';
const CREATE_OPTION_VALUE = '__create_option__';

export type SelectOrCustomInputOption = {
  value: string;
  label: string;
};

type SelectOrCustomInputProps = {
  options: SelectOrCustomInputOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  createOptionLabel?: (query: string) => string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  'aria-label'?: string;
};

export function SelectOrCustomInput({
  options,
  value,
  onChange,
  placeholder = 'Select or type…',
  createOptionLabel = (query) => `Add "${query}"`,
  disabled,
  className = '',
  inputClassName = 'rounded border border-slate-300 px-2 py-1.5 text-sm',
  'aria-label': ariaLabel,
}: SelectOrCustomInputProps) {
  const [query, setQuery] = useState('');
  const trimmedQuery = query.trim();
  const hasExactMatch = useMemo(() => {
    if (!trimmedQuery) return true;
    const q = trimmedQuery.toLowerCase();
    return options.some((o) => o.value.toLowerCase() === q || o.label.toLowerCase() === q);
  }, [options, trimmedQuery]);

  const comboboxOptions = useMemo<ComboboxOption[]>(
    () => {
      const out: ComboboxOption[] = [...options];
      if (value && !out.some((o) => o.value === value)) {
        out.unshift({ value, label: value });
      }
      if (trimmedQuery && !hasExactMatch) {
        out.push({ value: CREATE_OPTION_VALUE, label: createOptionLabel(trimmedQuery) });
      }
      return out;
    },
    [options, value, trimmedQuery, hasExactMatch, createOptionLabel]
  );

  const getInputValueAfterPick = useCallback(
    (pickedValue: string, _option: ComboboxOption | undefined, inputSnapshot: string) => {
      if (pickedValue === CREATE_OPTION_VALUE) return inputSnapshot.trim();
      return undefined;
    },
    []
  );

  const selectOnEnter = useCallback(
    (input: string) => {
      const t = input.trim();
      if (!t) return undefined;
      const exact = options.some(
        (o) => o.value === t || o.label.toLowerCase() === t.toLowerCase()
      );
      if (exact) return undefined;
      return CREATE_OPTION_VALUE;
    },
    [options]
  );

  return (
    <div className={className}>
      <Combobox
        className="w-full max-w-none"
        inputClassName={inputClassName}
        value={value}
        onChange={(nextValue) => {
          if (nextValue === CREATE_OPTION_VALUE) {
            onChange(trimmedQuery);
            setQuery('');
            return;
          }
          onChange(nextValue);
          setQuery('');
        }}
        onQueryChange={setQuery}
        getInputValueAfterPick={getInputValueAfterPick}
        selectOnEnter={selectOnEnter}
        options={comboboxOptions}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
      />
    </div>
  );
}
