import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock, getCurrentRateMock } = vi.hoisted(
  () => ({
    mockPrisma: {
      mgrReminder: { findUnique: vi.fn() },
      lot: { findUnique: vi.fn() },
      product: { findUnique: vi.fn() },
    },
    getCurrentUserMock: vi.fn(),
    getCurrentRateMock: vi.fn(),
  }),
);

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
}));
vi.mock("@/lib/exchange-rate", () => ({
  getCurrentRate: () => getCurrentRateMock(),
}));

import { GET } from "./route";

const MANAGER = {
  id: "u1",
  email: "a@b.c",
  fullName: "Alice",
  role: "manager" as const,
  isActive: true,
  code1C: null,
  telegramLinked: false,
  notifyChannels: [],
  lastSeenAt: null,
};

function req(): NextRequest {
  return new NextRequest(
    "http://localhost/api/v1/manager/reminders/r1/viber-message",
  );
}
function params(id = "r1") {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/v1/manager/reminders/[id]/viber-message", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(MANAGER);
    getCurrentRateMock.mockResolvedValue(43);
  });

  it("returns 401 when not authorized", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(req(), params());
    expect(res.status).toBe(401);
  });

  it("returns 404 when reminder not found", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValue(null);
    const res = await GET(req(), params());
    expect(res.status).toBe(404);
  });

  it("returns 403 for a foreign owner (non-admin)", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValue({
      id: "r1",
      ownerUserId: "other",
      lotId: null,
      productId: "p1",
    });
    const res = await GET(req(), params());
    expect(res.status).toBe(403);
  });

  it("returns 404 when the lot is missing", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValue({
      id: "r1",
      ownerUserId: "u1",
      lotId: "lotX",
      productId: null,
    });
    mockPrisma.lot.findUnique.mockResolvedValue(null);
    const res = await GET(req(), params());
    expect(res.status).toBe(404);
  });

  it("returns 404 when neither lot nor product resolves", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValue({
      id: "r1",
      ownerUserId: "u1",
      lotId: null,
      productId: null,
    });
    const res = await GET(req(), params());
    expect(res.status).toBe(404);
  });

  it("builds the share text from a lot + its product", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValue({
      id: "r1",
      ownerUserId: "u1",
      lotId: "lot1",
      productId: null,
    });
    mockPrisma.lot.findUnique.mockResolvedValue({
      productId: "p1",
      weight: 25,
      barcode: "BC-1",
      videoUrl: "https://youtu.be/lotvid",
    });
    mockPrisma.product.findUnique.mockResolvedValue({
      name: "Куртки зимові",
      articleCode: "ART-1",
      description: "Мікс",
      videoUrl: null,
      createdAt: new Date("2020-01-01T00:00:00Z"),
      prices: [{ priceType: "wholesale", amount: 10 }],
    });

    const res = await GET(req(), params());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(typeof body.text).toBe("string");
    expect(body.text).toContain("Куртки зимові");
    expect(body.text).toContain("ART-1");
    expect(body.text).toContain("BC-1");
    // Відео-посилання лоту має пріоритет.
    expect(body.text).toContain("https://youtu.be/lotvid");
    // Вартість лота рахується (25кг × 10€ × 43).
    expect(body.text).toContain("Вага лоту: 25 кг");
  });

  it("builds the share text from a product directly (no lot)", async () => {
    mockPrisma.mgrReminder.findUnique.mockResolvedValue({
      id: "r1",
      ownerUserId: "u1",
      lotId: null,
      productId: "p2",
    });
    mockPrisma.product.findUnique.mockResolvedValue({
      name: "Взуття",
      articleCode: null,
      description: "",
      videoUrl: "https://youtu.be/provid",
      createdAt: new Date("2020-01-01T00:00:00Z"),
      prices: [
        { priceType: "wholesale", amount: 12 },
        { priceType: "akciya", amount: 9 },
      ],
    });

    const res = await GET(req(), params());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.text).toContain("Взуття");
    expect(body.text).toContain("https://youtu.be/provid");
    // Акційна ціна нижча за базову → бейдж АКЦІЯ.
    expect(body.text).toContain("🔥 АКЦІЯ");
    expect(mockPrisma.lot.findUnique).not.toHaveBeenCalled();
  });
});
