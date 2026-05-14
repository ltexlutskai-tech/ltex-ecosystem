import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    mgrUserViewPrefs: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
  },
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma, Prisma: {} }));

vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));

import { GET, PUT, DELETE } from "./route";

function makeReq(
  body?: unknown,
  method: "GET" | "PUT" | "DELETE" = "GET",
): NextRequest {
  const init: {
    method: string;
    body?: string;
    headers: Record<string, string>;
  } = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new NextRequest(
    "http://localhost/api/v1/manager/me/view-prefs/clients_table",
    init,
  );
}

const USER = {
  id: "u1",
  email: "x@y",
  fullName: "X",
  role: "manager" as const,
  isActive: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(USER);
  mockPrisma.mgrUserViewPrefs.findUnique.mockResolvedValue(null);
  mockPrisma.mgrUserViewPrefs.upsert.mockResolvedValue({});
  mockPrisma.mgrUserViewPrefs.delete.mockResolvedValue({});
});

describe("GET /api/v1/manager/me/view-prefs/[viewKey]", () => {
  it("returns defaults коли немає row у DB", async () => {
    const res = await GET(makeReq(undefined, "GET"), {
      params: Promise.resolve({ viewKey: "clients_table" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: { key: string; visible: boolean }[];
    };
    expect(json.items.length).toBeGreaterThan(0);
    // Перший дефолтний — "name", visible
    expect(json.items[0]?.key).toBe("name");
    expect(json.items[0]?.visible).toBe(true);
  });

  it("returns saved config коли row існує + auto-append нових keys", async () => {
    mockPrisma.mgrUserViewPrefs.findUnique.mockResolvedValueOnce({
      id: "p1",
      userId: "u1",
      viewKey: "clients_table",
      config: {
        items: [
          { key: "debt", visible: true, order: 1 },
          { key: "name", visible: false, order: 2 },
        ],
      },
    });
    const res = await GET(makeReq(undefined, "GET"), {
      params: Promise.resolve({ viewKey: "clients_table" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: { key: string; visible: boolean }[];
    };
    expect(json.items[0]).toEqual({ key: "debt", visible: true, order: 1 });
    expect(json.items[1]).toEqual({ key: "name", visible: false, order: 2 });
    // Решта keys auto-appended invisible
    expect(json.items.slice(2).every((i) => !i.visible)).toBe(true);
  });

  it("returns 400 при невалідному viewKey", async () => {
    const res = await GET(makeReq(undefined, "GET"), {
      params: Promise.resolve({ viewKey: "orders_table" }),
    });
    expect(res.status).toBe(400);
    expect(mockPrisma.mgrUserViewPrefs.findUnique).not.toHaveBeenCalled();
  });

  it("returns 401 коли немає auth", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(makeReq(undefined, "GET"), {
      params: Promise.resolve({ viewKey: "clients_table" }),
    });
    expect(res.status).toBe(401);
    expect(mockPrisma.mgrUserViewPrefs.findUnique).not.toHaveBeenCalled();
  });
});

describe("PUT /api/v1/manager/me/view-prefs/[viewKey]", () => {
  it("saves valid items + returns 200", async () => {
    const items = [
      { key: "name", visible: true, order: 1 },
      { key: "debt", visible: false, order: 2 },
    ];
    const res = await PUT(makeReq({ items }, "PUT"), {
      params: Promise.resolve({ viewKey: "clients_table" }),
    });
    expect(res.status).toBe(200);
    expect(mockPrisma.mgrUserViewPrefs.upsert).toHaveBeenCalledTimes(1);
  });

  it("returns 400 коли key не у whitelist", async () => {
    const items = [
      { key: "name", visible: true, order: 1 },
      { key: "bogusXYZ", visible: true, order: 2 },
    ];
    const res = await PUT(makeReq({ items }, "PUT"), {
      params: Promise.resolve({ viewKey: "clients_table" }),
    });
    expect(res.status).toBe(400);
    expect(mockPrisma.mgrUserViewPrefs.upsert).not.toHaveBeenCalled();
  });

  it("returns 400 коли body порожнє (treat as reset → reject)", async () => {
    const res = await PUT(makeReq({ items: [] }, "PUT"), {
      params: Promise.resolve({ viewKey: "clients_table" }),
    });
    expect(res.status).toBe(400);
    expect(mockPrisma.mgrUserViewPrefs.upsert).not.toHaveBeenCalled();
  });

  it("returns 400 коли items missing у body", async () => {
    const res = await PUT(makeReq({ foo: "bar" }, "PUT"), {
      params: Promise.resolve({ viewKey: "clients_table" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 коли немає auth", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await PUT(
      makeReq({ items: [{ key: "name", visible: true, order: 1 }] }, "PUT"),
      {
        params: Promise.resolve({ viewKey: "clients_table" }),
      },
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 для invalid viewKey", async () => {
    const res = await PUT(
      makeReq({ items: [{ key: "name", visible: true, order: 1 }] }, "PUT"),
      {
        params: Promise.resolve({ viewKey: "wat" }),
      },
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/v1/manager/me/view-prefs/[viewKey]", () => {
  it("deletes row + returns defaults", async () => {
    const res = await DELETE(makeReq(undefined, "DELETE"), {
      params: Promise.resolve({ viewKey: "clients_table" }),
    });
    expect(res.status).toBe(200);
    expect(mockPrisma.mgrUserViewPrefs.delete).toHaveBeenCalledTimes(1);
    const json = (await res.json()) as { items: { key: string }[] };
    expect(json.items.length).toBeGreaterThan(0);
  });

  it("returns 401 коли не auth", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await DELETE(makeReq(undefined, "DELETE"), {
      params: Promise.resolve({ viewKey: "clients_table" }),
    });
    expect(res.status).toBe(401);
  });
});
