import { apiConfig } from './config';

/** An error answer from an OBDX service, or a network failure (status 0). */
export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly body?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Calls an OBDX REST service and returns its JSON answer. Paths are relative to apiConfig.baseUrl, as in the bank's
 * OBDX service definitions. Sign-in and session handling (cookies or tokens) are added here once for all modules.
 */
export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), apiConfig.timeoutMs);
  let response: Response;
  try {
    response = await fetch(apiConfig.baseUrl + path, {
      method,
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      signal: controller.signal,
    });
  } catch (e) {
    throw new ApiError(0, 'The bank could not be reached. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }
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
