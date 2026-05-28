import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiError, api } from "../api-client";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ApiError", () => {
  it("has correct shape", () => {
    const err = new ApiError(500, "ERR", "boom", { detail: 1 });
    expect(err.name).toBe("ApiError");
    expect(err.status).toBe(500);
    expect(err.code).toBe("ERR");
    expect(err.message).toBe("boom");
    expect(err.details).toEqual({ detail: 1 });
  });
});

describe("api.get", () => {
  it("attaches Authorization header from getToken", async () => {
    localStorage.setItem("proberx_token", "mytoken");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: "ok" }),
    }));

    await api.get("/test");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/test"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer mytoken" }),
      }),
    );
  });

  it("returns JSON for 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: "ok" }),
    }));

    const result = await api.get("/test");
    expect(result).toEqual({ data: "ok" });
  });

  it("returns undefined for 204", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.resolve({}),
    }));

    const result = await api.get("/test");
    expect(result).toBeUndefined();
  });

  it("throws ApiError on 500", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ code: "ERR", message: "boom" }),
    }));

    await expect(api.get("/test")).rejects.toThrow(ApiError);
  });
});
