const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function getApiBase(): string {
  return API_BASE;
}

function branchIdFromStorage(): string | undefined {
  try {
    const u = localStorage.getItem('tradeflow_user');
    if (!u) return undefined;
    const j = JSON.parse(u) as { branchId?: string };
    return j.branchId || undefined;
  } catch {
    return undefined;
  }
}

export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('tradeflow_token');
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  const bid = branchIdFromStorage();
  if (bid) h['X-Branch-Id'] = bid;
  return h;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...getAuthHeaders(), ...(init?.headers as Record<string, string>) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.message || err.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

/** Unwrap `{ data: T }` responses from master APIs */
export async function apiFetchData<T>(path: string, init?: RequestInit): Promise<T> {
  const json = await apiFetch<{ data: T }>(path, init);
  return json.data;
}

/** Open an authenticated URL (e.g. HTML invoice) in a new tab via blob URL. */
export async function openAuthenticatedRoute(path: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.message || err.error || `Request failed: ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
}

/** Download a file (e.g. Excel export) with Bearer auth. Omits Content-Type so multipart can use FormData elsewhere. */
export async function downloadAuthenticatedFile(path: string, filename: string): Promise<void> {
  const token = localStorage.getItem('tradeflow_token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const bid = branchIdFromStorage();
  if (bid) headers['X-Branch-Id'] = bid;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.message || err.error || `Request failed: ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
