import { describe, it, expect, vi } from "vitest";
import { TerminalWsClient } from "../terminal-ws";

describe("TerminalWsClient", () => {
  it("has initial state disconnected", () => {
    const client = new TerminalWsClient();
    expect(client.getState()).toBe("disconnected");
  });

  it("registers and unregisters state listeners", () => {
    const client = new TerminalWsClient();
    const fn = vi.fn();
    const unsub = client.onStateChange(fn);
    client.disconnect();
    expect(fn).toHaveBeenCalled();
    unsub();
    fn.mockClear();
    client.disconnect();
    expect(fn).not.toHaveBeenCalled();
  });

  it("registers and unregisters data handlers", () => {
    const client = new TerminalWsClient();
    const unsub = client.onData(() => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("send on disconnected is a no-op", () => {
    const client = new TerminalWsClient();
    expect(() => client.send("test")).not.toThrow();
  });

  it("disconnect on disconnected is a no-op", () => {
    const client = new TerminalWsClient();
    expect(() => client.disconnect()).not.toThrow();
    expect(client.getState()).toBe("disconnected");
  });

  it("sendResize on disconnected is a no-op", () => {
    const client = new TerminalWsClient();
    expect(() => client.sendResize(80, 24)).not.toThrow();
  });
});
