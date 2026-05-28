import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAuthStore } from "../auth-store";

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState({
    user: null,
    token: null,
    isLoading: true,
    isAuthenticated: false,
  });
});

describe("initialize", () => {
  it("sets demo user when bypass is enabled", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_BYPASS", "true");
    useAuthStore.getState().initialize();
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(true);
    expect(s.isLoading).toBe(false);
    expect(s.user?.email).toBe("dev@proberx.local");
  });

  it("sets authenticated when token exists", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_BYPASS", "false");
    localStorage.setItem("proberx_token", "mytoken");
    localStorage.setItem("proberx_user", JSON.stringify({ id: "1", email: "a@b.com", name: "Alice" }));
    useAuthStore.getState().initialize();
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(true);
    expect(s.token).toBe("mytoken");
  });

  it("sets unauthenticated when no token", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_BYPASS", "false");
    useAuthStore.getState().initialize();
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(false);
    expect(s.isLoading).toBe(false);
  });
});

describe("logout", () => {
  it("clears tokens and resets state", () => {
    localStorage.setItem("proberx_token", "abc");
    useAuthStore.setState({ user: { id: "1", email: "x", name: "X" }, token: "abc", isAuthenticated: true });
    useAuthStore.getState().logout();
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(false);
    expect(s.user).toBeNull();
    expect(localStorage.getItem("proberx_token")).toBeNull();
  });
});
