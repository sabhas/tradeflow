import { EntityManager, IsNull } from 'typeorm';
import { Account, CompanySettings } from '@tradeflow/db';

/** Cash-like methods post to cash account; bank/transfer/card post to bank. */
export function isBankPaymentMethod(paymentMethod: string): boolean {
  const m = paymentMethod.toLowerCase();
  return m === 'bank' || m === 'transfer' || m === 'card';
}

export async function getCompanyAccountingSettings(
  manager: EntityManager
): Promise<{ cashId: string; bankId: string }> {
  const row = (
    await manager.getRepository(CompanySettings).find({
      order: { id: 'ASC' },
      take: 1,
      relations: ['defaultCashAccount', 'defaultBankAccount'],
    })
  )[0];
  if (row) {
    return { cashId: row.defaultCashAccountId, bankId: row.defaultBankAccountId };
  }
  const [cash, bank] = await Promise.all([
    manager.findOne(Account, { where: { code: '1000' } }),
    manager.findOne(Account, { where: { code: '1010' } }),
  ]);
  const c = cash ?? (await manager.findOne(Account, { where: { code: '1000' } }));
  const b = bank ?? (await manager.findOne(Account, { where: { code: '1010' } }));
  if (!c || !b) throw new Error('Default cash/bank accounts missing. Run migrations.');
  return { cashId: c.id, bankId: b.id };
}

export async function resolveLiquidAccountId(manager: EntityManager, paymentMethod: string): Promise<string> {
  const { cashId, bankId } = await getCompanyAccountingSettings(manager);
  return isBankPaymentMethod(paymentMethod) ? bankId : cashId;
}

export async function getCompanySettingsRow(manager: EntityManager): Promise<CompanySettings> {
  const row = (
    await manager.getRepository(CompanySettings).find({
      order: { id: 'ASC' },
      take: 1,
      relations: ['defaultInvoiceTemplate'],
    })
  )[0];
  if (!row) throw new Error('Company settings not initialized');
  return row;
}
