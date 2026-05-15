import { describe, it, expect, vi, afterEach } from "vitest";
import { createIdempotencyStore } from "./idempotency";

afterEach(() => {
  vi.useRealTimers();
});

describe("idempotency cache", () => {
  it("stores and returns cached result for the same key", () => {
    const store = createIdempotencyStore();
    expect(store.get("k1")).toBeNull();
    store.set("k1", { ok: true, code1C: "000001" });
    expect(store.get("k1")).toEqual({ ok: true, code1C: "000001" });
  });

  it("isolates entries between different keys", () => {
    const store = createIdempotencyStore();
    store.set("a", { value: 1 });
    store.set("b", { value: 2 });
    expect(store.get("a")).toEqual({ value: 1 });
    expect(store.get("b")).toEqual({ value: 2 });
    expect(store.get("missing")).toBeNull();
    expect(store.size()).toBe(2);
  });

  it("expires entries after TTL passes", () => {
    vi.useFakeTimers();
    const baseTime = Date.now();
    vi.setSystemTime(baseTime);

    const store = createIdempotencyStore({ ttlMs: 1000 });
    store.set("ephemeral", { ok: true });
    expect(store.get("ephemeral")).toEqual({ ok: true });

    vi.setSystemTime(baseTime + 1500);
    expect(store.get("ephemeral")).toBeNull();
    expect(store.size()).toBe(0);
  });

  it("clear() removes everything", () => {
    const store = createIdempotencyStore();
    store.set("k1", 1);
    store.set("k2", 2);
    expect(store.size()).toBe(2);
    store.clear();
    expect(store.size()).toBe(0);
    expect(store.get("k1")).toBeNull();
  });

  it("overwrites an existing key with new result", () => {
    const store = createIdempotencyStore();
    store.set("key", { v: "first" });
    store.set("key", { v: "second" });
    expect(store.get("key")).toEqual({ v: "second" });
  });
});
