import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAggregate = vi.fn();
vi.mock("@ltex/db", () => ({
  prisma: {
    product: {
      aggregate: (...args: unknown[]) => mockAggregate(...args),
    },
  },
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/catalog/numeric-ranges", () => {
  it("returns floor/ceil bounds for unitsPerKg + 2-decimal weight", async () => {
    mockAggregate.mockResolvedValue({
      _min: { unitsPerKgMin: 1.7, unitWeightMin: 0.234 },
      _max: { unitsPerKgMax: 8.4, unitWeightMax: 1.567 },
    });

    const res = await GET();
    const json = await res.json();

    expect(json).toEqual({
      unitsPerKg: { min: 1, max: 9 },
      unitWeight: { min: 0.23, max: 1.57 },
    });
    expect(mockAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { inStock: true },
        _min: { unitsPerKgMin: true, unitWeightMin: true },
        _max: { unitsPerKgMax: true, unitWeightMax: true },
      }),
    );
  });

  it("falls back to defaults when aggregate returns null", async () => {
    mockAggregate.mockResolvedValue({
      _min: { unitsPerKgMin: null, unitWeightMin: null },
      _max: { unitsPerKgMax: null, unitWeightMax: null },
    });

    const res = await GET();
    const json = await res.json();

    expect(json).toEqual({
      unitsPerKg: { min: 0, max: 20 },
      unitWeight: { min: 0, max: 5 },
    });
  });

  it("sends Cache-Control 5min", async () => {
    mockAggregate.mockResolvedValue({
      _min: { unitsPerKgMin: 0, unitWeightMin: 0 },
      _max: { unitsPerKgMax: 1, unitWeightMax: 1 },
    });

    const res = await GET();
    expect(res.headers.get("Cache-Control")).toContain("max-age=300");
  });
});
