import { describe, it, expect } from "vitest";
import { endOfTomorrow } from "./video-task";

describe("endOfTomorrow", () => {
  it("повертає 23:59:59.999 наступного дня", () => {
    const now = new Date(2026, 6, 23, 14, 30, 0); // 23 лип 2026, 14:30
    const r = endOfTomorrow(now);
    expect(r.getFullYear()).toBe(2026);
    expect(r.getMonth()).toBe(6);
    expect(r.getDate()).toBe(24);
    expect(r.getHours()).toBe(23);
    expect(r.getMinutes()).toBe(59);
    expect(r.getSeconds()).toBe(59);
  });

  it("коректно переходить через кінець місяця", () => {
    const now = new Date(2026, 6, 31, 9, 0, 0); // 31 лип 2026
    const r = endOfTomorrow(now);
    expect(r.getMonth()).toBe(7); // серпень
    expect(r.getDate()).toBe(1);
  });
});
