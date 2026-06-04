import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    product: { findUnique: vi.fn() },
    lot: { findMany: vi.fn(), findUnique: vi.fn() },
  },
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

import { generateLotBarcode, parseBarcode } from "./barcode-generator";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateLotBarcode", () => {
  it("базовий формат L-{article}-{seq:05}", async () => {
    mockPrisma.product.findUnique.mockResolvedValueOnce({
      id: "p1",
      articleCode: "040",
      code1C: "T040",
    });
    mockPrisma.lot.findMany.mockResolvedValueOnce([]);
    mockPrisma.lot.findUnique.mockResolvedValueOnce(null);
    const code = await generateLotBarcode("p1");
    expect(code).toBe("L-040-00001");
  });

  it("інкрементує seq на основі max існуючих", async () => {
    mockPrisma.product.findUnique.mockResolvedValueOnce({
      id: "p1",
      articleCode: "ABC",
      code1C: null,
    });
    mockPrisma.lot.findMany.mockResolvedValueOnce([
      { barcode: "L-ABC-00001" },
      { barcode: "L-ABC-00015" },
      { barcode: "L-ABC-00007" },
    ]);
    mockPrisma.lot.findUnique.mockResolvedValueOnce(null);
    const code = await generateLotBarcode("p1");
    expect(code).toBe("L-ABC-00016");
  });

  it("fallback на code1C коли articleCode відсутній", async () => {
    mockPrisma.product.findUnique.mockResolvedValueOnce({
      id: "p1",
      articleCode: null,
      code1C: "X9Z",
    });
    mockPrisma.lot.findMany.mockResolvedValueOnce([]);
    mockPrisma.lot.findUnique.mockResolvedValueOnce(null);
    const code = await generateLotBarcode("p1");
    expect(code).toBe("L-X9Z-00001");
  });

  it("санітайз — прибирає не-alnum, обмежує 8 символів, uppercase", async () => {
    mockPrisma.product.findUnique.mockResolvedValueOnce({
      id: "p1",
      articleCode: "tt-c4c-uk",
      code1C: null,
    });
    mockPrisma.lot.findMany.mockResolvedValueOnce([]);
    mockPrisma.lot.findUnique.mockResolvedValueOnce(null);
    const code = await generateLotBarcode("p1");
    expect(code).toMatch(/^L-TTC4CUK-\d{5}$/);
  });

  it("кидає коли product не знайдено", async () => {
    mockPrisma.product.findUnique.mockResolvedValueOnce(null);
    await expect(generateLotBarcode("nope")).rejects.toThrow(
      /Product not found/,
    );
  });

  it("обходить колізію інкрементом", async () => {
    mockPrisma.product.findUnique.mockResolvedValueOnce({
      id: "p1",
      articleCode: "X",
      code1C: null,
    });
    mockPrisma.lot.findMany.mockResolvedValueOnce([{ barcode: "L-X-00005" }]);
    // Перша спроба — колізія
    mockPrisma.lot.findUnique
      .mockResolvedValueOnce({ id: "existing" })
      .mockResolvedValueOnce(null);
    const code = await generateLotBarcode("p1");
    expect(code).toBe("L-X-00007");
  });
});

describe("parseBarcode", () => {
  it("розпізнає власний паттерн L-XXX-NNNNN", () => {
    const res = parseBarcode("L-040-00001");
    expect(res.recognized).toBe(true);
    expect(res.articleCode).toBe("040");
    expect(res.pattern).toBe("ltex-internal");
  });

  it("тримує whitespace", () => {
    const res = parseBarcode("  L-X-00001  ");
    expect(res.raw).toBe("L-X-00001");
    expect(res.recognized).toBe(true);
  });

  // ── Зашитий паттерн постачальника (приклади від user 2026-06-05) ────────
  it("парсить артикул 37047 + вагу 18.0 з '0370474018010000432665008t'", () => {
    const res = parseBarcode("0370474018010000432665008t");
    expect(res.pattern).toBe("ltex-supplier");
    expect(res.articleCode).toBe("37047");
    expect(res.weight).toBeCloseTo(18.0, 1);
  });

  it("парсить артикул 37047 + вагу 18.2 з '137047701820I201592006008T'", () => {
    const res = parseBarcode("137047701820I201592006008T");
    expect(res.articleCode).toBe("37047");
    expect(res.weight).toBeCloseTo(18.2, 1);
  });

  it("парсить артикул 64092 + вагу 15.2 з '1640924015201301512006008T'", () => {
    const res = parseBarcode("1640924015201301512006008T");
    expect(res.articleCode).toBe("64092");
    expect(res.weight).toBeCloseTo(15.2, 1);
  });

  it("парсить артикул 64092 + вагу 16.5 з '164092901650G100112006008T'", () => {
    const res = parseBarcode("164092901650G100112006008T");
    expect(res.articleCode).toBe("64092");
    expect(res.weight).toBeCloseTo(16.5, 1);
  });

  it("парсить артикул 31002 + вагу 28.8 з '03100250288005004426550009'", () => {
    const res = parseBarcode("03100250288005004426550009");
    expect(res.articleCode).toBe("31002");
    expect(res.weight).toBeCloseTo(28.8, 1);
  });

  it("парсить артикул 31002 + вагу 29.2 з '03100230292003002326550009'", () => {
    const res = parseBarcode("03100230292003002326550009");
    expect(res.articleCode).toBe("31002");
    expect(res.weight).toBeCloseTo(29.2, 1);
  });

  it("повертає 'unknown' для коротких/невалідних паттернів", () => {
    const res = parseBarcode("abc");
    expect(res.pattern).toBe("unknown");
    expect(res.recognized).toBe(false);
  });
});
