import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';

export function normalizeHeaderKey(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function cellToString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' && Number.isFinite(val)) return String(val);
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === 'object' && val !== null) {
    const o = val as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text.trim();
    if (Array.isArray(o.richText)) {
      return o.richText.map((x: { text?: string }) => x.text ?? '').join('').trim();
    }
    if ('result' in o) return cellToString(o.result);
  }
  return String(val).trim();
}

export type SheetTable = { name: string; rows: Record<string, string>[] };

export function parseCsvToSheet(name: string, buffer: Buffer): SheetTable {
  const text = buffer.toString('utf8');
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  }) as Record<string, unknown>[];

  const rows: Record<string, string>[] = [];
  for (const rec of records) {
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(rec)) {
      const key = normalizeHeaderKey(k);
      if (!key) continue;
      row[key] = cellToString(v);
    }
    rows.push(row);
  }
  return { name, rows };
}

export async function parseXlsxToSheets(buffer: Buffer): Promise<SheetTable[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as never);
  const out: SheetTable[] = [];

  for (const ws of wb.worksheets) {
    if (!ws.rowCount || ws.rowCount < 2) continue;

    const headerRow = ws.getRow(1);
    const colCount = Math.max(ws.columnCount || 0, headerRow.cellCount);
    const normHeaders: string[] = [];
    for (let c = 1; c <= colCount; c++) {
      const raw = headerRow.getCell(c).value;
      normHeaders[c - 1] = normalizeHeaderKey(cellToString(raw));
    }

    const rows: Record<string, string>[] = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const dataRow = ws.getRow(r);
      const obj: Record<string, string> = {};
      let any = false;
      for (let c = 1; c <= colCount; c++) {
        const hk = normHeaders[c - 1];
        if (!hk) continue;
        const v = cellToString(dataRow.getCell(c).value);
        if (v) any = true;
        obj[hk] = v;
      }
      if (any) rows.push(obj);
    }

    if (rows.length) {
      out.push({ name: ws.name, rows });
    }
  }

  return out;
}

export async function parseUploadToSheets(
  buffer: Buffer,
  mimetype: string,
  originalname: string
): Promise<SheetTable[]> {
  const lower = originalname.toLowerCase();
  if (mimetype.includes('csv') || lower.endsWith('.csv')) {
    return [parseCsvToSheet('Sheet1', buffer)];
  }
  return parseXlsxToSheets(buffer);
}
