import { EntityManager } from 'typeorm';
import { getCompanySettingsRow } from './companySettings';

/** Block posting when document date is on or before the locked-through date (inclusive). */
export async function assertDateNotPeriodLocked(manager: EntityManager, documentDate: string): Promise<void> {
  const d = documentDate.slice(0, 10);
  const cs = await getCompanySettingsRow(manager);
  const lock = cs.periodLockedThrough?.slice(0, 10);
  if (!lock) return;
  if (d <= lock) {
    throw new Error(
      `Accounting period is locked through ${lock}. Choose a date after ${lock} or clear the lock in Settings.`
    );
  }
}
