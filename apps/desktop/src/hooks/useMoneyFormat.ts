import { useMemo } from 'react';
import { formatAmount, formatAmountInput, formatAmountPlain, normalizeAmountInput } from '../lib/numberFormat';
import { useAppSelector } from './useAppSelector';

type AmountValue = Parameters<typeof formatAmount>[0];

export function useMoneyFormat() {
  const fractionDigits = useAppSelector((s) => s.app.amountFractionDigits);

  return useMemo(
    () => ({
      fractionDigits,
      formatMoney: (value: AmountValue) => formatAmount(value, fractionDigits),
      formatMoneyPlain: (value: AmountValue) => formatAmountPlain(value, fractionDigits),
      formatMoneyInput: (raw: string) => formatAmountInput(raw, fractionDigits),
      normalizeMoneyInput: (raw: string) => normalizeAmountInput(raw, fractionDigits),
      roundMoney: (n: number) => Number(n.toFixed(fractionDigits)),
      moneyToFixed: (n: number) => n.toFixed(fractionDigits),
    }),
    [fractionDigits]
  );
}
