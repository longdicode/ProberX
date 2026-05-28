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

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      clearTokens();
      if (typeof window !== "undefined") window.location.href = "/login";
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
  async get<T>(path: string, options?: { params?: Record<string, string | number | boolean | undefined>; headers?: Record<string, string> }): Promise<T> {
    const token = getToken();
    const res = await fetch(buildUrl(path, options?.params), {
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options?.headers || {}) },
    });
    return handleResponse<T>(res);
  },

  async post<T>(path: string, body?: unknown, options?: { headers?: Record<string, string> }): Promise<T> {
    const token = getToken();
    const res = await fetch(buildUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options?.headers || {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res);
  },

  async patch<T>(path: string, body?: unknown): Promise<T> {
    const token = getToken();
    const res = await fetch(buildUrl(path), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res);
  },

  async delete<T>(path: string): Promise<T> {
    const token = getToken();
    const res = await fetch(buildUrl(path), {
      method: "DELETE",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    return handleResponse<T>(res);
  },
};

export { ApiError };
