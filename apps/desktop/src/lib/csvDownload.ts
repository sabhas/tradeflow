function escapeCell(c: string): string {
  return `"${String(c).replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const lines = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
