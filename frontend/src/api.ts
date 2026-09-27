import { storage } from '@/src/utils/storage';

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;
export const TOKEN_KEY = 'grafik_token';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api(path: string, init: RequestInit = {}): Promise<any> {
  const token = await storage.getItem(TOKEN_KEY);
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail =
      (data && (data.detail || data.message)) || `Błąd połączenia (${res.status})`;
    throw new ApiError(typeof detail === 'string' ? detail : 'Wystąpił błąd', res.status);
  }
  return data;
}

export const get = (path: string) => api(path);
export const post = (path: string, body?: any) =>
  api(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
export const put = (path: string, body?: any) =>
  api(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });
export const del = (path: string) => api(path, { method: 'DELETE' });
