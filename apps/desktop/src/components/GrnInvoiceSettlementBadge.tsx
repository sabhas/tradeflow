export type InvoiceSettlement = 'not_applicable' | 'awaiting_invoice' | 'invoice_draft' | 'invoice_posted';

const LABELS: Record<InvoiceSettlement, string> = {
  not_applicable: '—',
  awaiting_invoice: 'Awaiting invoice',
  invoice_draft: 'Invoice draft',
  invoice_posted: 'Invoice posted',
};

const STYLES: Record<InvoiceSettlement, string> = {
  not_applicable: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  awaiting_invoice: 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200',
  invoice_draft: 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-200',
  invoice_posted: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200',
};

export function GrnInvoiceSettlementBadge({ settlement }: { settlement: InvoiceSettlement }) {
  if (settlement === 'not_applicable') {
    return <span className="text-slate-400">—</span>;
  }
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[settlement]}`}>
      {LABELS[settlement]}
    </span>
  );
}
