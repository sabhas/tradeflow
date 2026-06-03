import { randomUUID } from 'crypto';
import type { EntityManager } from 'typeorm';
import { Account } from '@tradeflow/db';
import { GL_ACCOUNT_CODES } from '../constants/glAccounts';
import { HttpError } from '../utils/httpError';

export type GlSubAccountType = 'asset' | 'liability';

export async function createGlSubAccount(
  manager: EntityManager,
  options: {
    parentCode: string;
    codePrefix: string;
    name: string;
    type: GlSubAccountType;
  }
): Promise<Account> {
  const accountRepo = manager.getRepository(Account);
  const parent = await accountRepo.findOne({ where: { code: options.parentCode } });
  if (!parent) {
    throw new HttpError(500, {
      error: `GL parent account (${options.parentCode}) is missing`,
    });
  }

  return accountRepo.save(
    accountRepo.create({
      code: `${options.codePrefix}-${randomUUID()}`,
      name: options.name.slice(0, 255),
      type: options.type,
      parentId: parent.id,
      isSystem: false,
    })
  );
}

export async function createCustomerReceivableAccount(
  manager: EntityManager,
  customerName: string
): Promise<Account> {
  return createGlSubAccount(manager, {
    parentCode: GL_ACCOUNT_CODES.AR_TRADE,
    codePrefix: `${GL_ACCOUNT_CODES.AR_TRADE}-CUST`,
    name: customerName,
    type: 'asset',
  });
}

export async function createSupplierPayableAccount(
  manager: EntityManager,
  supplierName: string
): Promise<Account> {
  return createGlSubAccount(manager, {
    parentCode: GL_ACCOUNT_CODES.AP_TRADE,
    codePrefix: `${GL_ACCOUNT_CODES.AP_TRADE}-SUPP`,
    name: supplierName,
    type: 'liability',
  });
}
