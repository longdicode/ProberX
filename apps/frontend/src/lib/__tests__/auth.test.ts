import { describe, it, expect, beforeEach } from "vitest";
import {
  getToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  getStoredUser,
  setStoredUser,
  isAuthenticated,
} from "../auth";

beforeEach(() => {
  localStorage.clear();
});

describe("setTokens", () => {
  it("stores access token", () => {
    setTokens("abc123");
    expect(localStorage.getItem("proberx_token")).toBe("abc123");
  });

  it("stores refresh token when provided", () => {
    setTokens("abc123", "ref456");
    expect(localStorage.getItem("proberx_token")).toBe("abc123");
    expect(localStorage.getItem("proberx_refresh_token")).toBe("ref456");
  });
});

describe("getToken", () => {
  it("returns stored token", () => {
    localStorage.setItem("proberx_token", "abc123");
    expect(getToken()).toBe("abc123");
  });

  it("returns null when empty", () => {
    expect(getToken()).toBeNull();
  });
});

describe("getRefreshToken", () => {
  it("returns stored refresh token", () => {
    localStorage.setItem("proberx_refresh_token", "ref456");
    expect(getRefreshToken()).toBe("ref456");
  });
});

describe("clearTokens", () => {
  it("removes all auth keys", () => {
    localStorage.setItem("proberx_token", "abc");
    localStorage.setItem("proberx_refresh_token", "ref");
    localStorage.setItem("proberx_user", '{"id":"1"}');
    clearTokens();
    expect(localStorage.getItem("proberx_token")).toBeNull();
    expect(localStorage.getItem("proberx_refresh_token")).toBeNull();
    expect(localStorage.getItem("proberx_user")).toBeNull();
  });
});

describe("setStoredUser / getStoredUser", () => {
  it("roundtrips user data", () => {
    const user = { id: "1", email: "a@b.com", name: "Alice" };
    setStoredUser(user);
    expect(getStoredUser()).toEqual(user);
  });
});

describe("isAuthenticated", () => {
  it("returns true with token", () => {
    localStorage.setItem("proberx_token", "abc");
    expect(isAuthenticated()).toBe(true);
  });

  it("returns false after clear", () => {
    expect(isAuthenticated()).toBe(false);
  });
});
