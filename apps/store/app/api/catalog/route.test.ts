import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@ltex/db", () => ({
  prisma: {
    category: {
      findUnique: vi.fn(),
    },
  },
}));

const mockGetCatalogProducts = vi.fn();
vi.mock("@/lib/catalog", () => ({
  getCatalogProducts: (...args: unknown[]) => mockGetCatalogProducts(...args),
}));

import { GET } from "./route";
import { prisma } from "@ltex/db";

const mockFindUnique = prisma.category.findUnique as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCatalogProducts.mockResolvedValue({
    products: [],
    total: 0,
    totalPages: 0,
  });
});

function buildRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/catalog${query}`);
}

describe("GET /api/catalog", () => {
  it("forwards subcategorySlug straight to getCatalogProducts", async () => {
    await GET(buildRequest("?subcategorySlug=dytyachyj-odyah"));

    expect(mockGetCatalogProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        subcategorySlug: "dytyachyj-odyah",
        categoryIds: undefined,
      }),
    );
    // Subcategory takes precedence — no category lookup is performed.
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("expands categorySlug to parent + child IDs via Prisma lookup", async () => {
    mockFindUnique.mockResolvedValue({
      id: "cat-parent",
      children: [{ id: "cat-child-1" }, { id: "cat-child-2" }],
    });

    await GET(buildRequest("?categorySlug=odyah"));

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { slug: "odyah" },
      include: { children: { select: { id: true } } },
    });
    expect(mockGetCatalogProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryIds: ["cat-parent", "cat-child-1", "cat-child-2"],
        subcategorySlug: undefined,
      }),
    );
  });

  it("ignores categorySlug when subcategorySlug is also supplied", async () => {
    await GET(
      buildRequest("?categorySlug=odyah&subcategorySlug=dytyachyj-odyah"),
    );

    // Skip the parent lookup — the subcategory clause already pins the result.
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockGetCatalogProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        subcategorySlug: "dytyachyj-odyah",
        categoryIds: undefined,
      }),
    );
  });

  it("passes inStock=true through as inStockOnly", async () => {
    await GET(buildRequest("?inStock=true"));

    expect(mockGetCatalogProducts).toHaveBeenCalledWith(
      expect.objectContaining({ inStockOnly: true }),
    );
  });
});
