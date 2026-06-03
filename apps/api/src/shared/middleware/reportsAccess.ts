import type { NextFunction, Request, Response } from 'express';

/** Requires sales:read or purchases.reports:read (or wildcard). */
export function requireTaxSummaryAccess(req: Request, res: Response, next: NextFunction): void {
  const p = req.auth?.permissions ?? [];
  const allowed = p.includes('*') || p.includes('sales:read') || p.includes('purchases.reports:read');
  if (!allowed) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Permission sales:read or purchases.reports:read required',
    });
    return;
  }
  next();
}
