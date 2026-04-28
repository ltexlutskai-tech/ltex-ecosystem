import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@ltex/db", () => ({
  prisma: {
    category: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { GET } from "./route";
import { prisma } from "@ltex/db";

const mockFindMany = prisma.category.findMany as ReturnType<typeof vi.fn>;
const mockFindUnique = prisma.category.findUnique as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

function buildRequest(query = ""): NextRequest {
  return new NextRequest(`http://localhost/api/categories${query}`);
}

describe("GET /api/categories", () => {
  it("returns top-level categories when no parent is supplied", async () => {
    mockFindMany.mockResolvedValue([
      { id: "c1", slug: "odyah", name: "Одяг", parentId: null },
      { id: "c2", slug: "vzuttya", name: "Взуття", parentId: null },
    ]);

    const res = await GET(buildRequest());
    const body = await res.json();

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { parentId: null },
        orderBy: { position: "asc" },
      }),
    );
    expect(body.categories).toHaveLength(2);
    expect(body.categories[0].slug).toBe("odyah");
  });

  it("returns children of the given parent slug", async () => {
    mockFindUnique.mockResolvedValue({
      id: "c1",
      children: [
        {
          id: "c1a",
          slug: "dytyachyj-odyah",
          name: "Дитячий одяг",
          parentId: "c1",
        },
      ],
    });

    const res = await GET(buildRequest("?parent=odyah"));
    const body = await res.json();

    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: "odyah" },
      }),
    );
    expect(body.categories).toHaveLength(1);
    expect(body.categories[0].slug).toBe("dytyachyj-odyah");
  });

  it("returns empty array when parent slug is unknown", async () => {
    mockFindUnique.mockResolvedValue(null);

    const res = await GET(buildRequest("?parent=missing"));
    const body = await res.json();

    expect(body.categories).toEqual([]);
  });
});
