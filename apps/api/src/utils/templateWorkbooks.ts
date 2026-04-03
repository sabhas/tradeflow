import ExcelJS from 'exceljs';

export async function productImportTemplateBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Products');
  ws.addRow([
    'supplier',
    'category',
    'sku',
    'barcode',
    'name',
    'unit',
    'costPrice',
    'sellingPrice',
    'batchTracked',
    'expiryTracked',
  ]);
  ws.addRow(['Acme Pharma', 'BEV', 'SKU-001', '', 'Sample cola 500ml', 'EA', '0.50', '1.20', 'false', 'false']);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function customerImportTemplateBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Customers');
  ws.addRow([
    'name',
    'type',
    'contactPhone',
    'contactEmail',
    'contactAddress',
    'creditLimit',
    'paymentTerms',
    'taxProfile',
  ]);
  ws.addRow([
    'Acme Retail',
    'retailer',
    '+123',
    'a@example.com',
    '1 Main St',
    '1000',
    '',
    '',
  ]);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function openingBalanceTemplateBuffer(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const inv = wb.addWorksheet('Inventory');
  inv.addRow(['warehouseCode', 'movementDate', 'productSku', 'quantity', 'unitCost']);
  inv.addRow(['MAIN', '2025-01-01', 'SKU-001', '100', '0.50']);

  const jr = wb.addWorksheet('Journal');
  jr.addRow(['entryDate', 'reference', 'accountCode', 'debit', 'credit']);
  jr.addRow(['2025-01-01', 'OB', '1200', '500.00', '0']);
  jr.addRow(['2025-01-01', 'OB', '3000', '0', '500.00']);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export function productImportTemplateCsv(): string {
  return [
    'supplier,category,sku,barcode,name,unit,costPrice,sellingPrice,batchTracked,expiryTracked',
    'Acme Pharma,BEV,SKU-001,,Sample cola 500ml,EA,0.50,1.20,false,false',
  ].join('\n');
}

export function customerImportTemplateCsv(): string {
  return [
    'name,type,contactPhone,contactEmail,contactAddress,creditLimit,paymentTerms,taxProfile',
    'Acme Retail,retailer,+123,a@example.com,1 Main St,1000,,',
  ].join('\n');
}

export function openingInventoryTemplateCsv(): string {
  return [
    'warehouseCode,movementDate,productSku,quantity,unitCost',
    'MAIN,2025-01-01,SKU-001,100,0.50',
  ].join('\n');
}
