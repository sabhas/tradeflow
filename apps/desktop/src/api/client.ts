const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('tradeflow_token');
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
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
  return res.json();
}

/** Unwrap `{ data: T }` responses from master APIs */
export async function apiFetchData<T>(path: string, init?: RequestInit): Promise<T> {
  const json = await apiFetch<{ data: T }>(path, init);
  return json.data;
}
