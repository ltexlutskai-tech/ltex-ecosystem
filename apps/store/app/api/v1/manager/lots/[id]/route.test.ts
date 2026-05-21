import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    lot: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
  Prisma: { PrismaClientKnownRequestError: class {} },
}));

vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
  MANAGER_ACCESS_COOKIE: "ltex_mgr_access",
  MANAGER_REFRESH_COOKIE: "ltex_mgr_refresh",
}));

import { GET, PATCH } from "./route";

const MANAGER_USER = {
  id: "u1",
  email: "alice@example.com",
  fullName: "Alice",
  role: "manager" as const,
  isActive: true,
  code1C: null,
  telegramLinked: false,
  notifyChannels: [],
  lastSeenAt: null,
};

function makeGetReq(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/v1/manager/lots/${id}`, {
    method: "GET",
  });
}

function makePatchReq(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/v1/manager/lots/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const fakeLot = {
  id: "lot1",
  productId: "p1",
  barcode: "1234567890123",
  weight: 25,
  quantity: 1,
  status: "free",
  priceEur: 100,
  videoUrl: "https://youtu.be/abc",
  isTarget: false,
  arrivalDate: new Date("2026-05-01"),
  sector: "A-1",
  isOpen: false,
  comment: null,
  description: null,
  videoDate: null,
  reservedForClientId: null,
  reservedForName: null,
  reservedByUserId: null,
  reservedByName: null,
  reservedUntil: null,
  createdAt: new Date("2026-04-01"),
  updatedAt: new Date("2026-05-01"),
  product: {
    id: "p1",
    name: "Куртки зимові",
    slug: "kurtky-zymovi",
    articleCode: "AB-1",
    description: "Опис прайсу",
    videoUrl: "https://youtu.be/prod",
    createdAt: new Date("2026-04-01"),
    prices: [
      { priceType: "wholesale", amount: 10 },
      { priceType: "akciya", amount: 8 },
    ],
  },
  barcodes: [
    { id: "bc1", code: "1234567890123", type: "EAN13" },
    { id: "bc2", code: "9999999999999", type: "EAN13" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(MANAGER_USER);
});

describe("GET /api/v1/manager/lots/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await GET(makeGetReq("lot1"), {
      params: Promise.resolve({ id: "lot1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when lot not found", async () => {
    mockPrisma.lot.findUnique.mockResolvedValueOnce(null);
    const res = await GET(makeGetReq("missing"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns lot card shape with owner/barcodes/manager fields/reservation", async () => {
    mockPrisma.lot.findUnique.mockResolvedValueOnce(fakeLot);
    const res = await GET(makeGetReq("lot1"), {
      params: Promise.resolve({ id: "lot1" }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      lot: {
        id: string;
        product: { id: string; name: string; slug: string };
        weight: number;
        sector: string | null;
        isOpen: boolean;
        videoUrl: string | null;
        arrivalIso: string;
        barcodes: { code: string }[];
        reservation: { isReserved: boolean };
      };
    };
    expect(json.lot.id).toBe("lot1");
    expect(json.lot.product.name).toBe("Куртки зимові");
    expect(json.lot.weight).toBe(25);
    expect(json.lot.sector).toBe("A-1");
    expect(json.lot.isOpen).toBe(false);
    expect(json.lot.videoUrl).toBe("https://youtu.be/abc");
    expect(json.lot.reservation.isReserved).toBe(false);
    // primary barcode перший, дублів немає
    expect(json.lot.barcodes[0]?.code).toBe("1234567890123");
    expect(json.lot.barcodes).toHaveLength(2);
    expect(json.lot.barcodes.map((b) => b.code)).toEqual([
      "1234567890123",
      "9999999999999",
    ]);
  });

  it("marks reservation.isReserved=true коли status=reserved", async () => {
    mockPrisma.lot.findUnique.mockResolvedValueOnce({
      ...fakeLot,
      status: "reserved",
    });
    const res = await GET(makeGetReq("lot1"), {
      params: Promise.resolve({ id: "lot1" }),
    });
    const json = (await res.json()) as {
      lot: { reservation: { isReserved: boolean } };
    };
    expect(json.lot.reservation.isReserved).toBe(true);
  });

  it("віддає бронь-поля + isMine для своєї активної броні", async () => {
    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    mockPrisma.lot.findUnique.mockResolvedValueOnce({
      ...fakeLot,
      status: "reserved",
      reservedForClientId: "c1",
      reservedForName: "ТОВ Ромашка",
      reservedByUserId: "u1", // = MANAGER_USER.id
      reservedByName: "Alice",
      reservedUntil: until,
    });
    const res = await GET(makeGetReq("lot1"), {
      params: Promise.resolve({ id: "lot1" }),
    });
    const json = (await res.json()) as {
      lot: {
        reservation: {
          isActive: boolean;
          isMine: boolean;
          reservedForName: string | null;
          reservedByName: string | null;
          reservedUntilIso: string | null;
        };
      };
    };
    expect(json.lot.reservation.isActive).toBe(true);
    expect(json.lot.reservation.isMine).toBe(true);
    expect(json.lot.reservation.reservedForName).toBe("ТОВ Ромашка");
    expect(json.lot.reservation.reservedByName).toBe("Alice");
    expect(json.lot.reservation.reservedUntilIso).toBe(until.toISOString());
  });

  it("чужа активна бронь — isMine=false", async () => {
    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    mockPrisma.lot.findUnique.mockResolvedValueOnce({
      ...fakeLot,
      status: "reserved",
      reservedByUserId: "u2",
      reservedForName: "Інший клієнт",
      reservedUntil: until,
    });
    const res = await GET(makeGetReq("lot1"), {
      params: Promise.resolve({ id: "lot1" }),
    });
    const json = (await res.json()) as {
      lot: { reservation: { isActive: boolean; isMine: boolean } };
    };
    expect(json.lot.reservation.isActive).toBe(true);
    expect(json.lot.reservation.isMine).toBe(false);
  });
});

describe("PATCH /api/v1/manager/lots/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await PATCH(makePatchReq("lot1", { sector: "B-2" }), {
      params: Promise.resolve({ id: "lot1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 on validation error (sector too long)", async () => {
    const res = await PATCH(makePatchReq("lot1", { sector: "x".repeat(101) }), {
      params: Promise.resolve({ id: "lot1" }),
    });
    expect(res.status).toBe(400);
    expect(mockPrisma.lot.update).not.toHaveBeenCalled();
  });

  it("updates only manager fields on happy path", async () => {
    mockPrisma.lot.update.mockResolvedValueOnce({
      ...fakeLot,
      sector: "B-2",
      isOpen: true,
      comment: "перевірено",
      isTarget: true,
    });
    const res = await PATCH(
      makePatchReq("lot1", {
        sector: "B-2",
        isOpen: true,
        comment: "перевірено",
        isTarget: true,
      }),
      { params: Promise.resolve({ id: "lot1" }) },
    );
    expect(res.status).toBe(200);
    const updateCall = (mockPrisma.lot.update.mock.calls[0] ?? [])[0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(updateCall.where).toEqual({ id: "lot1" });
    expect(updateCall.data).toEqual({
      sector: "B-2",
      isOpen: true,
      comment: "перевірено",
      isTarget: true,
    });
    const json = (await res.json()) as { lot: { sector: string | null } };
    expect(json.lot.sector).toBe("B-2");
  });

  it("IGNORES forbidden 1С fields (weight/quantity/status/barcode/arrivalDate/priceEur/videoUrl)", async () => {
    mockPrisma.lot.update.mockResolvedValueOnce(fakeLot);
    await PATCH(
      makePatchReq("lot1", {
        sector: "C-3",
        weight: 999,
        quantity: 5,
        status: "sold",
        barcode: "HACK",
        arrivalDate: "2030-01-01T00:00:00.000Z",
        priceEur: 1,
        videoUrl: "https://evil.example",
      }),
      { params: Promise.resolve({ id: "lot1" }) },
    );
    const updateCall = (mockPrisma.lot.update.mock.calls[0] ?? [])[0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(Object.keys(updateCall.data)).toEqual(["sector"]);
    expect(updateCall.data).not.toHaveProperty("weight");
    expect(updateCall.data).not.toHaveProperty("quantity");
    expect(updateCall.data).not.toHaveProperty("status");
    expect(updateCall.data).not.toHaveProperty("barcode");
    expect(updateCall.data).not.toHaveProperty("arrivalDate");
    expect(updateCall.data).not.toHaveProperty("priceEur");
    expect(updateCall.data).not.toHaveProperty("videoUrl");
  });

  it("partial update — empty body → empty data", async () => {
    mockPrisma.lot.update.mockResolvedValueOnce(fakeLot);
    await PATCH(makePatchReq("lot1", {}), {
      params: Promise.resolve({ id: "lot1" }),
    });
    const updateCall = (mockPrisma.lot.update.mock.calls[0] ?? [])[0] as {
      data: Record<string, unknown>;
    };
    expect(updateCall.data).toEqual({});
  });
});
