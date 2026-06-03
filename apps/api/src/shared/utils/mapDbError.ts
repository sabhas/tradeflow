import { HttpError } from './httpError';

interface PgDriverError {
  code?: string;
  constraint?: string;
  detail?: string;
  message?: string;
}

function asPgError(e: unknown): PgDriverError | null {
  if (!e || typeof e !== 'object') return null;
  const err = e as PgDriverError & { driverError?: PgDriverError };
  if (err.driverError && typeof err.driverError === 'object') {
    return err.driverError;
  }
  if (typeof err.code === 'string') return err;
  return null;
}

const CONSTRAINT_MESSAGES: Record<string, { status: number; error: string }> = {
  UQ_supplier_invoice_number: {
    status: 409,
    error: 'Invoice number already exists for this supplier',
  },
  UQ_supplier_invoices_grn_id: {
    status: 409,
    error: 'A supplier invoice is already linked to this GRN',
  },
  UQ_supplier_invoice: {
    status: 409,
    error: 'Supplier invoice constraint violation',
  },
};

/**
 * Maps PostgreSQL / TypeORM errors to HttpError. Returns null if unmappable.
 */
export function mapDbError(e: unknown): HttpError | null {
  const pg = asPgError(e);
  if (!pg) return null;

  if (pg.code === '23505' && pg.constraint) {
    const mapped = CONSTRAINT_MESSAGES[pg.constraint];
    if (mapped) {
      return new HttpError(mapped.status, { error: mapped.error });
    }
    return new HttpError(409, { error: 'Duplicate record', message: pg.detail });
  }

  if (pg.code === '23503') {
    return new HttpError(400, { error: 'Referenced record does not exist', message: pg.detail });
  }

  if (pg.code === '23502') {
    return new HttpError(400, { error: 'Required field missing', message: pg.detail });
  }

  return null;
}

/**
 * Re-throws HttpError; maps known DB errors; otherwise wraps as 400 with message.
 */
export function handleControllerError(e: unknown, fallbackMessage = 'Operation failed'): never {
  if (e instanceof HttpError) throw e;
  const db = mapDbError(e);
  if (db) throw db;
  const msg = e instanceof Error ? e.message : fallbackMessage;
  if (msg === 'Not found') {
    throw new HttpError(404, { error: 'Not found' });
  }
  throw new HttpError(400, { error: msg });
}
