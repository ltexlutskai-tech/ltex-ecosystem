import { describe, it, expect, vi, beforeEach } from "vitest";

const { findFirstMock } = vi.hoisted(() => ({ findFirstMock: vi.fn() }));

vi.mock("@ltex/db", () => ({
  prisma: { exchangeRate: { findFirst: findFirstMock } },
}));

import { getEurRateForDate, getCurrentRate } from "./exchange-rate";

beforeEach(() => {
  findFirstMock.mockReset();
});

describe("getEurRateForDate (історичний курс на дату)", () => {
  it("повертає курс із найближчою датою ≤ цільової", async () => {
    // Перший виклик (lte date desc) знаходить запис.
    findFirstMock.mockResolvedValueOnce({ rate: 41.5 });
    const rate = await getEurRateForDate(new Date("2024-03-10"));
    expect(rate).toBe(41.5);
    // Має запитати з фільтром date.lte + EUR→UAH.
    const arg = findFirstMock.mock.calls[0]![0];
    expect(arg.where.currencyFrom).toBe("EUR");
    expect(arg.where.currencyTo).toBe("UAH");
    expect(arg.where.date.lte).toEqual(new Date("2024-03-10"));
    expect(arg.orderBy).toEqual({ date: "desc" });
  });

  it("якщо дата раніше першого курсу — бере найперший доступний", async () => {
    findFirstMock
      .mockResolvedValueOnce(null) // немає запису ≤ дати
      .mockResolvedValueOnce({ rate: 38.2 }); // найперший (asc)
    const rate = await getEurRateForDate(new Date("2019-01-01"));
    expect(rate).toBe(38.2);
    expect(findFirstMock.mock.calls[1]![0].orderBy).toEqual({ date: "asc" });
  });

  it("порожній ряд → fallback 43", async () => {
    findFirstMock.mockResolvedValue(null);
    const rate = await getEurRateForDate(new Date("2024-01-01"));
    expect(rate).toBe(43);
  });

  it("null/невалідна дата → поточний курс (latest desc)", async () => {
    findFirstMock.mockResolvedValueOnce({ rate: 44.9 });
    const rate = await getEurRateForDate(null);
    expect(rate).toBe(44.9);
    // getCurrentRate-гілка — orderBy desc, без date-фільтра.
    const arg = findFirstMock.mock.calls[0]![0];
    expect(arg.where.date).toBeUndefined();
    expect(arg.orderBy).toEqual({ date: "desc" });
  });

  it("DB-помилка → fallback 43", async () => {
    findFirstMock.mockRejectedValueOnce(new Error("db down"));
    const rate = await getEurRateForDate(new Date("2024-01-01"));
    expect(rate).toBe(43);
  });
});

describe("getCurrentRate", () => {
  it("повертає найсвіжіший курс", async () => {
    findFirstMock.mockResolvedValueOnce({ rate: 45.7 });
    expect(await getCurrentRate()).toBe(45.7);
  });
});
