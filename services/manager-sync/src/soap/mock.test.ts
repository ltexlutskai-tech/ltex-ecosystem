import { describe, it, expect, vi } from "vitest";
import { updateClientMock } from "./mock";

describe("updateClientMock", () => {
  it("returns ok=true з mockMode=true прапорцем", async () => {
    const result = await updateClientMock(
      { idempotencyKey: "k1", payload: { code1C: "000001", name: "Test" } },
      { sleepFn: async () => undefined },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.mockMode).toBe(true);
      expect(result.code1C).toBe("000001");
      expect(result.errors).toEqual([]);
    }
  });

  it("generates synthetic MOCK-* code1C when payload.code1C missing", async () => {
    const result = await updateClientMock(
      { idempotencyKey: "k2", payload: { name: "New client" } },
      { sleepFn: async () => undefined },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.code1C).toMatch(/^MOCK-\d+$/);
    }
  });

  it("calls sleepFn with delay у вказаному вікні", async () => {
    const sleepSpy = vi.fn().mockResolvedValue(undefined);
    await updateClientMock(
      { idempotencyKey: "k3", payload: { code1C: "x" } },
      { sleepFn: sleepSpy, minMs: 50, maxMs: 200 },
    );
    expect(sleepSpy).toHaveBeenCalledOnce();
    const arg = sleepSpy.mock.calls[0]?.[0];
    expect(typeof arg).toBe("number");
    expect(arg).toBeGreaterThanOrEqual(50);
    expect(arg).toBeLessThanOrEqual(200);
  });

  it("treats empty-string code1C як missing і генерує MOCK-*", async () => {
    const result = await updateClientMock(
      { idempotencyKey: "k4", payload: { code1C: "" } },
      { sleepFn: async () => undefined },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.code1C).toMatch(/^MOCK-/);
    }
  });
});
