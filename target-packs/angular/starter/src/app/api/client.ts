import { apiConfig } from './config';

/** An error answer from an OBDX service, or a network failure (status 0). */
export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly body?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Fetches with the time limit and the session cookie; a network failure becomes an ApiError with status 0. */
async function send(method: Method, path: string, headers: Record<string, string>, body?: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), apiConfig.timeoutMs);
  try {
    return await fetch(apiConfig.baseUrl + path, {
      method,
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'The bank could not be reached. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }
}

/** A fresh nonce for one call that changes something (OBDX refuses such a call without it). */
async function nonce(): Promise<Record<string, string>> {
  if (!apiConfig.nonce.url) {
    return {};
  }
  const response = await send('POST', apiConfig.nonce.url, {});
  const value = response.headers.get(apiConfig.nonce.header);
  if (!response.ok || !value) {
    throw new ApiError(response.status, 'The bank did not accept the request. Sign in again and try once more.');
  }
  return { [apiConfig.nonce.header]: value };
}

/**
 * Calls an OBDX REST service and returns its JSON answer. Paths are relative to apiConfig.baseUrl, as in the bank's
 * OBDX service definitions. The session cookie goes with every call and a nonce with every call that changes something.
 */
export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers = method === 'GET' ? {} : await nonce();
  const response = await send(method, path, headers, body);
  const text = await response.text();
  const data: unknown = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new ApiError(response.status, messageOf(data) ?? `The request failed (${response.status}).`, data);
  }
  return data as T;
}

/** OBDX error answers carry their message in status.message.detail or a top-level message. */
function messageOf(data: unknown): string | undefined {
  const value = data as { status?: { message?: { detail?: string; title?: string } }; message?: string } | undefined;
  return value?.status?.message?.detail ?? value?.status?.message?.title ?? value?.message;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
