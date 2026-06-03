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
  });

  it("повертає raw для нерозпізнаних паттернів", () => {
    const res = parseBarcode("4820012345678");
    expect(res.recognized).toBe(false);
    expect(res.articleCode).toBeNull();
    expect(res.raw).toBe("4820012345678");
  });

  it("тримує whitespace", () => {
    const res = parseBarcode("  L-X-00001  ");
    expect(res.raw).toBe("L-X-00001");
    expect(res.recognized).toBe(true);
  });
});
