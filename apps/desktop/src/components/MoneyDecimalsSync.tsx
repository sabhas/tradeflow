import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client';
import { useAppDispatch } from '../hooks/useAppDispatch';
import { useAppSelector } from '../hooks/useAppSelector';
import { clampMoneyDecimals } from '../lib/moneyDecimalsStorage';
import { hasPermission } from '../lib/permissions';
import { setAmountFractionDigits } from '../store/slices/appSlice';

type GeneralMoneySettings = { moneyDecimals: number };

/**
 * Keeps Redux `amountFractionDigits` aligned with company settings from the API
 * so money formatting stays consistent across the app after login.
 */
export function MoneyDecimalsSync() {
  const dispatch = useAppDispatch();
  const token = useAppSelector((s) => s.auth.token);
  const permissions = useAppSelector((s) => s.auth.permissions);
  const canReadSettings = hasPermission(permissions, 'settings:read');

  const settings = useQuery({
    queryKey: ['settings', 'general'],
    enabled: !!token && canReadSettings,
    queryFn: () => apiFetch<{ data: GeneralMoneySettings }>('/settings').then((r) => r.data),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (settings.data?.moneyDecimals === undefined) return;
    dispatch(setAmountFractionDigits(clampMoneyDecimals(settings.data.moneyDecimals)));
  }, [dispatch, settings.data?.moneyDecimals]);

  return null;
}
