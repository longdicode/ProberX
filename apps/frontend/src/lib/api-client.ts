import { getToken, clearTokens, getRefreshToken, setTokens } from "./auth";
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
  noToast?: boolean;
};

let toastError: ((msg: string) => void) | null = null;
export function registerToastError(fn: (msg: string) => void) {
  toastError = fn;
}

function showErrorToast(message: string) {
  if (!toastError) return;
  try { toastError(message); } catch { }
}

let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${refreshToken}`,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.token) {
      setTokens(data.token, refreshToken);
      return data.token;
    }
    return null;
  } catch {
    return null;
  }
}

async function handleResponse<T>(res: Response, noToast?: boolean): Promise<T> {
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      if (!isRefreshing) {
        isRefreshing = true;
        refreshPromise = refreshAccessToken().finally(() => {
          isRefreshing = false;
          refreshPromise = null;
        });
      }
      const newToken = await refreshPromise;
      if (newToken) {
        throw new ApiError(401, "TOKEN_REFRESHED", "Token refreshed");
      }
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

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  noToast?: boolean
): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    try {
      await handleResponse(res, noToast);
    } catch (err) {
      if (err instanceof ApiError && err.code === "TOKEN_REFRESHED") {
        const newToken = getToken();
        if (newToken) {
          const newHeaders = { ...(init.headers as Record<string, string> || {}), Authorization: `Bearer ${newToken}` };
          return fetch(url, { ...init, headers: newHeaders });
        }
      }
      throw err;
    }
  }
  return res;
}

export const api = {
  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    const token = getToken();
    const url = buildUrl(path, options?.params);
    const res = await fetchWithRetry(url, {
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options?.headers || {}) },
    }, options?.noToast);
    return handleResponse<T>(res, options?.noToast);
  },

  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const token = getToken();
    const url = buildUrl(path);
    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options?.headers || {}) },
      body: body ? JSON.stringify(body) : undefined,
    }, options?.noToast);
    return handleResponse<T>(res, options?.noToast);
  },

  async patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const token = getToken();
    const url = buildUrl(path);
    const res = await fetchWithRetry(url, {
      method: "PATCH",
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }, options?.noToast);
    return handleResponse<T>(res, options?.noToast);
  },

  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const token = getToken();
    const url = buildUrl(path);
    const res = await fetchWithRetry(url, {
      method: "PUT",
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }, options?.noToast);
    return handleResponse<T>(res, options?.noToast);
  },

  async delete<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const token = getToken();
    const url = buildUrl(path);
    const res = await fetchWithRetry(url, {
      method: "DELETE",
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    }, options?.noToast);
    return handleResponse<T>(res, options?.noToast);
  },
};

export { ApiError };
