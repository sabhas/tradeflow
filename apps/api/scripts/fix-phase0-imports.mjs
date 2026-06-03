#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '../src');

const SERVICE_MODULE = {
  accountingPosting: 'accounting/services/accountingPosting',
  glAccountService: 'accounting/services/glAccountService',
  periodLock: 'accounting/services/periodLock',
  inventoryService: 'inventory/services/inventoryService',
  stockLayerService: 'inventory/services/stockLayerService',
  stockTransferPosting: 'inventory/services/stockTransferPosting',
  productBatchControls: 'inventory/services/productBatchControls',
  companySettings: 'settings/services/companySettings',
  grnInvoiceSettlement: 'purchases/services/grnInvoiceSettlement',
  grnPoValidation: 'purchases/services/grnPoValidation',
  purchaseTotals: 'purchases/services/purchaseTotals',
  supplierDueDateService: 'purchases/services/supplierDueDateService',
  supplierPayables: 'purchases/services/supplierPayables',
  importRunners: 'system/services/importRunners',
  listExportService: 'system/services/listExportService',
  salesTotals: 'sales/services/salesTotals',
  bonusService: 'sales/services/bonusService',
  salesOrderInvoiceGuard: 'sales/services/salesOrderInvoiceGuard',
  salesOrderStockValidation: 'sales/services/salesOrderStockValidation',
  invoicePosting: 'sales/services/invoicePosting',
  invoicePricingService: 'sales/services/invoicePricingService',
  invoiceCreditNoteLines: 'sales/services/invoiceCreditNoteLines',
  invoiceHtml: 'sales/services/invoiceHtml',
  invoiceBatchExpansion: 'sales/services/invoiceBatchExpansion',
  salesCustomerBalance: 'sales/services/salesCustomerBalance',
};

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (ent.name.endsWith('.ts')) files.push(p);
  }
  return files;
}

function moduleOf(filePath) {
  const rel = path.relative(srcRoot, filePath).replace(/\\/g, '/');
  const m = rel.match(/^modules\/([^/]+)\//);
  return m ? m[1] : null;
}

function relImport(fromFile, toModulePath) {
  const fromDir = path.dirname(fromFile);
  const toFile = path.join(srcRoot, 'modules', toModulePath);
  let rel = path.relative(fromDir, toFile).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel.replace(/\.ts$/, '');
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;
  const rel = path.relative(srcRoot, filePath).replace(/\\/g, '/');

  if (rel.startsWith('shared/middleware/')) {
    content = content.replace(/from '\.\.\/config'/g, "from '../../config'");
    content = content.replace(/from '\.\.\/logger'/g, "from '../../logger'");
  }

  if (rel.match(/^modules\/[^/]+\/routes\//)) {
    content = content.replace(/from '\.\.\/middleware\//g, "from '../../../shared/middleware/");
    content = content.replace(/from '\.\.\/utils\//g, "from '../../../shared/utils/");
  }

  if (rel.match(/^modules\/[^/]+\/controllers\//)) {
    content = content.replace(/from '\.\.\/utils\//g, "from '../../../shared/utils/");
  }

  if (rel.match(/^modules\/[^/]+\/services\/[^/]+\.ts$/)) {
    content = content.replace(/from '\.\.\/utils\//g, "from '../../../shared/utils/");
    content = content.replace(/from '\.\.\/constants\//g, "from '../../../shared/constants/");
  }

  if (rel.startsWith('modules/reports/services/reports/')) {
    content = content.replace(/from '\.\.\/\.\.\/utils\//g, "from '../../../../shared/utils/");
    content = content.replace(/from '\.\.\/\.\.\/constants\//g, "from '../../../../shared/constants/");
    content = content.replace(/from '\.\.\/companySettings'/g, "from '../../../settings/services/companySettings'");
  }

  const fileMod = moduleOf(filePath);
  if (fileMod) {
    content = content.replace(/from '\.\.\/services\/([a-zA-Z0-9]+)'/g, (match, svc) => {
      const target = SERVICE_MODULE[svc];
      if (!target) return match;
      const targetMod = target.split('/')[0];
      if (targetMod === fileMod) return `from '../services/${svc}'`;
      return `from '${relImport(filePath, target)}'`;
    });
    content = content.replace(/from '\.\/([a-zA-Z0-9]+)'/g, (match, svc) => {
      if (!SERVICE_MODULE[svc]) return match;
      const target = SERVICE_MODULE[svc];
      const targetMod = target.split('/')[0];
      if (targetMod === fileMod) return match;
      return `from '${relImport(filePath, target)}'`;
    });
  }

  if (rel === 'modules/system/services/importRunners.ts') {
    content = content.replace(/from '\.\/inventoryService'/g, "from '../../inventory/services/inventoryService'");
    content = content.replace(/from '\.\.\/utils\//g, "from '../../../shared/utils/");
    content = content.replace(/from '\.\.\/constants\//g, "from '../../../shared/constants/");
  }

  if (rel === 'app.ts') {
    content = content.replace(/from '\.\/middleware\//g, "from './shared/middleware/");
  }

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    return true;
  }
  return false;
}

const files = walk(srcRoot);
let changed = 0;
for (const f of files) {
  if (fixFile(f)) changed++;
}
console.log(`Updated ${changed} files`);
