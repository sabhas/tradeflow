import type {
  CompanySettings,
  Invoice,
  InvoiceLine,
  InvoiceTemplate,
  InvoiceTemplateConfig,
} from '@tradeflow/db';
import { roundAmountString } from '../utils/rounding';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cfgDefaults(c: InvoiceTemplateConfig | undefined): Required<InvoiceTemplateConfig> {
  return {
    showLogo: c?.showLogo !== false,
    showLegalName: c?.showLegalName !== false,
    showTaxNumber: c?.showTaxNumber !== false,
    showPaymentTerms: c?.showPaymentTerms !== false,
    showNotes: c?.showNotes !== false,
  };
}

export function buildInvoicePrintHtml(opts: {
  invoice: Invoice;
  lines: InvoiceLine[];
  customerName: string;
  company: CompanySettings;
  template: InvoiceTemplate | null;
  productNames: Map<string, string>;
  paymentTermsLabel?: string | null;
}): string {
  const { invoice: inv, lines, customerName, company, template, productNames, paymentTermsLabel } = opts;
  const cfg = cfgDefaults(template?.config);
  const md = Math.min(6, Math.max(0, company.moneyDecimals));
  const qd = Math.min(6, Math.max(0, company.quantityDecimals));
  const mode = company.roundingMode || 'half_up';
  const cur = company.currencyCode || 'USD';

  const addrParts = [
    company.addressLine1,
    company.addressLine2,
    [company.city, company.state].filter(Boolean).join(', '),
    [company.postalCode, company.country].filter(Boolean).join(' '),
  ].filter((x): x is string => typeof x === 'string' && x.trim().length > 0);

  const logoBlock =
    cfg.showLogo && company.logoUrl
      ? `<div style="margin-bottom:12px"><img src="${esc(company.logoUrl)}" alt="" style="max-height:64px;max-width:220px" /></div>`
      : '';

  const legalBlock =
    cfg.showLegalName && company.legalName && company.legalName !== company.companyName
      ? `<p style="margin:0;font-size:13px;color:#444">${esc(company.legalName)}</p>`
      : '';

  const taxBlock =
    cfg.showTaxNumber && company.taxRegistrationNumber
      ? `<p style="margin:4px 0 0;font-size:13px">Tax ID: ${esc(company.taxRegistrationNumber)}</p>`
      : '';

  const termsBlock =
    cfg.showPaymentTerms && paymentTermsLabel
      ? `<p style="margin:8px 0 0;font-size:13px">Payment terms: ${esc(paymentTermsLabel)}</p>`
      : '';

  const notesBlock = cfg.showNotes && inv.notes ? `<p style="margin-top:12px;font-size:13px">${esc(inv.notes)}</p>` : '';

  const rows =
    lines
      .map((l) => {
        const name = productNames.get(l.productId) ?? l.productId;
        const qty = roundAmountString(l.quantity, qd, mode);
        const price = roundAmountString(l.unitPrice, md, mode);
        const disc = roundAmountString(l.discountAmount || '0', md, mode);
        const tax = roundAmountString(l.taxAmount || '0', md, mode);
        const lineTot = roundAmountString(
          String(
            parseFloat(l.quantity) * parseFloat(l.unitPrice) -
              parseFloat(l.discountAmount || '0') +
              parseFloat(l.taxAmount || '0')
          ),
          md,
          mode
        );
        return `<tr>
    <td>${esc(name)}</td>
    <td style="text-align:right">${esc(qty)}</td>
    <td style="text-align:right">${esc(price)} ${cur}</td>
    <td style="text-align:right">${esc(disc)}</td>
    <td style="text-align:right">${esc(tax)}</td>
    <td style="text-align:right">${esc(lineTot)} ${cur}</td>
  </tr>`;
      })
      .join('') ?? '';

  const sub = roundAmountString(inv.subtotal, md, mode);
  const discH = roundAmountString(inv.discountAmount, md, mode);
  const taxT = roundAmountString(inv.taxAmount, md, mode);
  const tot = roundAmountString(inv.total, md, mode);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Invoice ${esc(inv.id.slice(0, 8))}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 800px; margin: 24px auto; color: #111; }
  h1 { font-size: 1.5rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { border: 1px solid #ccc; padding: 8px; font-size: 14px; }
  th { background: #f4f4f5; text-align: left; }
  .totals { margin-top: 16px; text-align: right; }
  .company { border-bottom: 1px solid #e4e4e7; padding-bottom: 16px; margin-bottom: 16px; }
</style></head><body>
  <div class="company">
    ${logoBlock}
    <h1 style="margin:0">${esc(company.companyName)}</h1>
    ${legalBlock}
    ${addrParts.length ? `<p style="margin:8px 0 0;font-size:13px;white-space:pre-line">${esc(addrParts.join('\n'))}</p>` : ''}
    ${company.phone || company.email
      ? `<p style="margin:8px 0 0;font-size:13px">${[company.phone, company.email]
          .filter((x): x is string => typeof x === 'string' && x.length > 0)
          .map(esc)
          .join(' · ')}</p>`
      : ''}
    ${taxBlock}
  </div>
  <h2 style="font-size:1.15rem;margin:0">Tax invoice</h2>
  <p><strong>${esc(customerName)}</strong><br/>
  Date: ${esc(inv.invoiceDate)} · Due: ${esc(inv.dueDate)} · Status: ${esc(inv.status)}</p>
  <p>Warehouse: ${esc(inv.warehouse?.name ?? inv.warehouseId)} · Payment: ${esc(inv.paymentType)}</p>
  ${termsBlock}
  <table>
    <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Disc</th><th>Tax</th><th>Line</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <p>Subtotal: ${esc(sub)} ${cur}</p>
    <p>Discount: ${esc(discH)} ${cur}</p>
    <p>Tax: ${esc(taxT)} ${cur}</p>
    <p><strong>Total: ${esc(tot)} ${cur}</strong></p>
  </div>
  ${notesBlock}
  <script>window.onload = function() { window.print(); }</script>
</body></html>`;
}
