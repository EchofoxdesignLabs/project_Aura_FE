import { AURA_API_URL } from '@core/config';

type RequestMethod = 'GET' | 'POST';

interface ApiErrorPayload {
  message?: string | string[];
  error?: string;
  statusCode?: number;
  [key: string]: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function resolveApiPath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function extractErrorMessage(payload: unknown, fallbackMessage: string): string {
  if (typeof payload === 'string' && payload.trim().length > 0) {
    return payload;
  }

  if (isRecord(payload)) {
    const nestedMessage = payload.message;
    if (typeof nestedMessage === 'string' && nestedMessage.trim().length > 0) {
      return nestedMessage;
    }

    if (Array.isArray(nestedMessage)) {
      const messages = nestedMessage.filter(
        (value): value is string => typeof value === 'string' && value.trim().length > 0,
      );
      if (messages.length > 0) {
        return messages.join(', ');
      }
    }

    if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
      return payload.error;
    }
  }

  return fallbackMessage;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text.length > 0 ? text : undefined;
}

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(status: number, message: string, payload: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export class ApiClient {
  private token: string | null = null;

  setToken(token: string | null): void {
    const normalizedToken = token?.trim();
    this.token = normalizedToken && normalizedToken.length > 0 ? normalizedToken : null;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(method: RequestMethod, path: string, body?: unknown): Promise<T> {
    const headers = new Headers({
      Accept: 'application/json',
    });

    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    if (body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${AURA_API_URL}${resolveApiPath(path)}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const payload = await parseResponseBody(response);

    if (!response.ok) {
      const fallbackMessage = `Request failed with status ${response.status}`;
      throw new ApiError(response.status, extractErrorMessage(payload, fallbackMessage), payload);
    }

    return payload as T;
  }
}

export type { ApiErrorPayload };

export const apiClient = new ApiClient();
