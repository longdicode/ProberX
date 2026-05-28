import { describe, it, expect, vi } from "vitest";
import { lookup, interpolate, detectBrowserLocale, resolveLocale } from "../locale-store";

describe("lookup", () => {
  const dict = {
    common: { save: "Save", cancel: "Cancel" },
    nav: { overview: "Overview" },
  };

  it("resolves a simple key", () => {
    expect(lookup(dict, "common.save")).toBe("Save");
  });

  it("resolves a nested key", () => {
    expect(lookup(dict, "nav.overview")).toBe("Overview");
  });

  it("returns the path when key is missing", () => {
    expect(lookup(dict, "common.missing")).toBe("common.missing");
  });

  it("returns the path for non-object traversal", () => {
    expect(lookup(dict, "common.save.nope")).toBe("common.save.nope");
  });
});

describe("interpolate", () => {
  it("returns template unchanged when no vars", () => {
    expect(interpolate("Hello world")).toBe("Hello world");
  });

  it("replaces {key} placeholders", () => {
    expect(interpolate("Hello {name}", { name: "Alice" })).toBe("Hello Alice");
  });

  it("leaves unknown key as {key}", () => {
    expect(interpolate("Hello {name}", {})).toBe("Hello {name}");
  });
});

describe("detectBrowserLocale", () => {
  it("returns zh for Chinese browser", () => {
    vi.stubGlobal("navigator", { language: "zh-CN" });
    expect(detectBrowserLocale()).toBe("zh");
  });

  it("returns en for English browser", () => {
    vi.stubGlobal("navigator", { language: "en-US" });
    expect(detectBrowserLocale()).toBe("en");
  });
});

describe("resolveLocale", () => {
  it("returns valid stored locale", () => {
    expect(resolveLocale("zh")).toBe("zh");
    expect(resolveLocale("en")).toBe("en");
  });

  it("falls back to detection for invalid value", () => {
    vi.stubGlobal("navigator", { language: "en-US" });
    expect(resolveLocale("fr")).toBe("en");
  });
});
