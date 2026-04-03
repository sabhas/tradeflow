function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Opens a print dialog for a simple HTML table (save as PDF from the browser). */
export function printTableAsPdf(title: string, subtitle: string, columns: string[], rows: string[][]): void {
  const thead = columns.map((c) => `<th>${esc(c)}</th>`).join('');
  const tbody = rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;color:#111}
h1{font-size:1.25rem;margin:0} .sub{color:#444;margin:8px 0 16px;font-size:14px}
table{border-collapse:collapse;width:100%;font-size:11px}
th,td{border:1px solid #ccc;padding:5px 7px}
th{background:#f4f4f5;text-align:left}
</style></head><body>
<h1>${esc(title)}</h1><p class="sub">${esc(subtitle)}</p>
<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
