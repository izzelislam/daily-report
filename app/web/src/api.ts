const KEY = 'dr_token';

export const getToken = () => localStorage.getItem(KEY) || '';
export const setToken = (t: string) => localStorage.setItem(KEY, t);
export const clearToken = () => localStorage.removeItem(KEY);

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/auth/login') {
    clearToken();
    window.dispatchEvent(new Event('dr:unauthorized'));
  }
  if (!res.ok) throw new ApiError(data.error || `HTTP ${res.status}`, res.status);
  return data as T;
}

export interface SessionInfo {
  sessionId: string;
  status: 'disconnected' | 'connecting' | 'qr' | 'connected' | 'error';
  isActive: boolean;
  phoneNumber?: string;
  userName?: string;
  lastSeenAt?: string;
  error?: string;
}

export interface LogMessage {
  cursor?: number;
  id: string;
  sessionId: string;
  direction: 'in' | 'out';
  peer?: string | null;
  body?: string | null;
  type?: string | null;
  timestamp: number;
}

export interface Stats {
  sessions: number;
  connected: number;
  total: number;
  today: number;
}

export interface WebhookItem {
  id: number;
  name: string;
  url: string;
  events: string;
  enabled: boolean;
  hasSecret: boolean;
  last_status: string | null;
  last_at: number | null;
}

export interface GroupItem {
  id: string;
  subject: string;
  size: number;
  announce: boolean;
}

export interface TokenItem {
  id: number;
  name: string;
  prefix: string;
  username: string;
  created_at: number;
  last_used_at: number | null;
}

/** Subscribe to server-sent events. Returns unsubscribe fn. */
export function subscribe(onEvent: (e: any) => void) {
  const es = new EventSource(`/api/events?token=${encodeURIComponent(getToken())}`);
  es.onmessage = (m) => {
    try {
      onEvent(JSON.parse(m.data));
    } catch {
      /* ignore */
    }
  };
  return () => es.close();
}
