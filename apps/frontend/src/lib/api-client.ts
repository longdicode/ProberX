import { getToken, clearTokens } from "./auth";
import { API_BASE_URL } from "./constants";

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = {
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  /** Suppress automatic toast on error — caller handles it */
  noToast?: boolean;
};

let toastError: ((msg: string) => void) | null = null;
/** Register a global toast function for automatic error display */
export function registerToastError(fn: (msg: string) => void) {
  toastError = fn;
}

function showErrorToast(message: string) {
  if (!toastError) return;
  try { toastError(message); } catch { /* toast may not be ready */ }
}

async function handleResponse<T>(res: Response, noToast?: boolean): Promise<T> {
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      clearTokens();
      if (typeof window !== "undefined") {
        const path = window.location.pathname;
        const isPublicPath = ["/login", "/register", "/status"].some((p) => path.startsWith(p));
        if (!isPublicPath) window.location.href = "/login";
      }
    } else if (res.status >= 500 && !noToast) {
      showErrorToast(data.message || "Server error — please try again");
    } else if (res.status === 429 && !noToast) {
      showErrorToast("Too many requests — please slow down");
    }
    throw new ApiError(res.status, data.code || "UNKNOWN", data.message || "An error occurred", data.details);
  }
  return data as T;
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }
  return url.toString();
}

export const api = {
  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    const token = getToken();
    const res = await fetch(buildUrl(path, options?.params), {
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options?.headers || {}) },
    });
    return handleResponse<T>(res, options?.noToast);
  },

  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const token = getToken();
    const res = await fetch(buildUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options?.headers || {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res, options?.noToast);
  },

  async patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const token = getToken();
    const res = await fetch(buildUrl(path), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res, options?.noToast);
  },

  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const token = getToken();
    const res = await fetch(buildUrl(path), {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res, options?.noToast);
  },

  async delete<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const token = getToken();
    const res = await fetch(buildUrl(path), {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res, options?.noToast);
  },
};

export { ApiError };
