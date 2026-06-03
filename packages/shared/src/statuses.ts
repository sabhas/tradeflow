/** Document and entity status constants shared by API and desktop. */

export const SalesOrderStatus = {
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  VOID: 'void',
} as const;
export type SalesOrderStatus = (typeof SalesOrderStatus)[keyof typeof SalesOrderStatus];

export const QuotationStatus = {
  DRAFT: 'draft',
  SENT: 'sent',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  CONVERTED: 'converted',
  VOID: 'void',
} as const;

export const InvoiceStatus = {
  DRAFT: 'draft',
  POSTED: 'posted',
  VOID: 'void',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const GrnStatus = {
  DRAFT: 'draft',
  POSTED: 'posted',
  VOID: 'void',
} as const;
export type GrnStatus = (typeof GrnStatus)[keyof typeof GrnStatus];

export const SupplierInvoiceStatus = {
  DRAFT: 'draft',
  POSTED: 'posted',
  VOID: 'void',
} as const;

export const PurchaseOrderStatus = {
  DRAFT: 'draft',
  SENT: 'sent',
  PARTIAL: 'partial',
  RECEIVED: 'received',
  CLOSED: 'closed',
  VOID: 'void',
} as const;

export const JournalEntryStatus = {
  DRAFT: 'draft',
  POSTED: 'posted',
  REVERSED: 'reversed',
} as const;

export const PurchaseReturnStatus = {
  DRAFT: 'draft',
  POSTED: 'posted',
  VOID: 'void',
} as const;
