import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@ltex/db", () => ({
  prisma: {
    price: {
      aggregate: vi.fn(),
    },
  },
}));

import { GET } from "./route";
import { prisma } from "@ltex/db";

const mockAggregate = prisma.price.aggregate as ReturnType<typeof vi.fn>;

describe("GET /api/catalog/price-range", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns floor(min) and ceil(max) over wholesale prices", async () => {
    mockAggregate.mockResolvedValue({
      _min: { amount: 2.7 },
      _max: { amount: 88.3 },
    });

    const res = await GET();
    const json = await res.json();

    expect(mockAggregate).toHaveBeenCalledWith({
      where: { priceType: "wholesale" },
      _min: { amount: true },
      _max: { amount: true },
    });
    expect(json).toEqual({ min: 2, max: 89 });
  });

  it("falls back to defaults 0/100 on empty DB", async () => {
    mockAggregate.mockResolvedValue({
      _min: { amount: null },
      _max: { amount: null },
    });

    const res = await GET();
    const json = await res.json();

    expect(json).toEqual({ min: 0, max: 100 });
  });

  it("returns equal min and max when only a single price exists", async () => {
    mockAggregate.mockResolvedValue({
      _min: { amount: 12 },
      _max: { amount: 12 },
    });

    const res = await GET();
    const json = await res.json();

    expect(json).toEqual({ min: 12, max: 12 });
  });
});
