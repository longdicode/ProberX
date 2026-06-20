import { create } from "zustand";
import { getToken, setTokens, clearTokens, getStoredUser, setStoredUser } from "@/lib/auth";
import { api } from "@/lib/api-client";

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  oauthLogin: (provider: string, code: string, redirectUri: string) => Promise<void>;
  logout: () => void;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,

  initialize: async () => {
    const token = getToken();
    const bypass = process.env.NEXT_PUBLIC_AUTH_BYPASS === "true";

    // Bypass mode: trust localStorage, never clear token on server errors
    if (bypass) {
      if (token && token !== "bypass") {
        // Try /auth/me but don't clear token on failure
        try {
          const user = await api.get<User>("/auth/me");
          set({ token, user, isAuthenticated: true, isLoading: false });
        } catch {
          // Keep existing token — server might be starting up
          const storedUser = getStoredUser();
          if (storedUser) {
            set({ token, user: storedUser, isAuthenticated: true, isLoading: false });
          } else {
            const demoUser = { id: "dev-001", name: "Dev User", email: "dev@proberx.local" };
            set({ token, user: demoUser, isAuthenticated: true, isLoading: false });
          }
        }
      } else {
        const demoUser = { id: "dev-001", name: "Dev User", email: "dev@proberx.local" };
        set({ token: "bypass", user: demoUser, isAuthenticated: true, isLoading: false });
      }
      return;
    }

    // Normal mode
    if (token) {
      try {
        const user = await api.get<User>("/auth/me");
        set({ token, user, isAuthenticated: true, isLoading: false });
      } catch {
        clearTokens();
        set({ token: null, user: null, isAuthenticated: false, isLoading: false });
      }
    } else {
      set({ token: null, user: null, isAuthenticated: false, isLoading: false });
    }
  },

  login: async (email, password) => {
    const res = await api.post<{ token: string; refreshToken?: string; user: User }>("/auth/login", { email, password });
    setTokens(res.token, res.refreshToken);
    setStoredUser(res.user);
    set({ user: res.user, token: res.token, isAuthenticated: true });
  },

  register: async (name, email, password) => {
    const res = await api.post<{ token: string; user: User }>("/auth/register", { name, email, password });
    setTokens(res.token);
    setStoredUser(res.user);
    set({ user: res.user, token: res.token, isAuthenticated: true });
  },

  oauthLogin: async (provider, code, redirectUri) => {
    const res = await api.post<{ token: string; refreshToken?: string; user: User }>("/auth/oauth", { provider, code, redirectUri });
    setTokens(res.token, res.refreshToken);
    setStoredUser(res.user);
    set({ user: res.user, token: res.token, isAuthenticated: true });
  },

  logout: () => {
    clearTokens();
    set({ user: null, token: null, isAuthenticated: false });
  },
}));
