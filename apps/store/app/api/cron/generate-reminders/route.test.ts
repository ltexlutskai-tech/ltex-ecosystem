import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    lot: { findMany: vi.fn(), update: vi.fn() },
    product: { findMany: vi.fn() },
    mgrReminder: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
    },
    // Order + User — для детектора C (прострочені замовлення)
    order: { findMany: vi.fn(), update: vi.fn() },
    user: { findMany: vi.fn() },
    // $transaction просто виконує передані promise-и (масив операцій).
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  },
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));

import { GET } from "./route";

const SECRET = "cron_secret_long_enough_value";

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/cron/generate-reminders", {
    method: "GET",
    headers,
  });
}

describe("GET /api/cron/generate-reminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = SECRET;
    // Дефолти — порожньо (тести перевизначають за потреби).
    mockPrisma.lot.findMany.mockResolvedValue([]);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockPrisma.mgrReminder.findFirst.mockResolvedValue(null);
    mockPrisma.mgrReminder.findMany.mockResolvedValue([]);
    mockPrisma.mgrReminder.create.mockResolvedValue({ id: "r1" });
    mockPrisma.mgrReminder.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.mgrReminder.update.mockResolvedValue({ id: "r1" });
    mockPrisma.lot.update.mockResolvedValue({ id: "lot1" });
    mockPrisma.order.findMany.mockResolvedValue([]);
    mockPrisma.order.update.mockResolvedValue({ id: "ord1" });
    mockPrisma.user.findMany.mockResolvedValue([]);
  });

  it("returns 401 without a valid secret", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(mockPrisma.lot.findMany).not.toHaveBeenCalled();
  });

  it("authorizes via x-cron-secret and returns counts", async () => {
    const res = await GET(req({ "x-cron-secret": SECRET }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({
      bronCreated: 0,
      videoFired: 0,
      orderRemindersCreated: 0,
      ordersEscalatedToSupervisor: 0,
    });
  });

  it("authorizes via Authorization Bearer header", async () => {
    const res = await GET(req({ authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
  });

  // ─── Детектор A: бронь минула ──────────────────────────────────────────────
  it("creates a continue_bron reminder and frees the lot for an expired booking", async () => {
    mockPrisma.lot.findMany.mockResolvedValue([
      {
        id: "lot1",
        barcode: "BC-1",
        productId: "p1",
        reservedForClientId: "c1",
        reservedForName: "ТОВ Ромашка",
        reservedByUserId: "u1",
        product: { articleCode: "ART-1" },
      },
    ]);

    const res = await GET(req({ "x-cron-secret": SECRET }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.bronCreated).toBe(1);

    // Створене нагадування з правильним типом дії + текстом.
    expect(mockPrisma.mgrReminder.create).toHaveBeenCalledTimes(1);
    const createArg = mockPrisma.mgrReminder.create.mock.calls[0]?.[0] as {
      data: {
        actionType: string;
        source: string;
        ownerUserId: string;
        clientId: string;
        lotId: string;
        body: string;
      };
    };
    expect(createArg.data.actionType).toBe("continue_bron");
    expect(createArg.data.source).toBe("auto_bron");
    expect(createArg.data.ownerUserId).toBe("u1");
    expect(createArg.data.clientId).toBe("c1");
    expect(createArg.data.lotId).toBe("lot1");
    expect(createArg.data.body).toContain("ART-1");
    expect(createArg.data.body).toContain("BC-1");
    expect(createArg.data.body).toContain("ТОВ Ромашка");
    expect(createArg.data.body).toContain("Перенести бронь?");

    // Лот звільнено (бронь знята).
    expect(mockPrisma.lot.update).toHaveBeenCalledTimes(1);
    const updateArg = mockPrisma.lot.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { status: string; reservedForClientId: null; reservedUntil: null };
    };
    expect(updateArg.where.id).toBe("lot1");
    expect(updateArg.data.status).toBe("free");
    expect(updateArg.data.reservedForClientId).toBeNull();
    expect(updateArg.data.reservedUntil).toBeNull();
  });

  it("dedups: skips when an active continue_bron reminder already exists", async () => {
    mockPrisma.lot.findMany.mockResolvedValue([
      {
        id: "lot1",
        barcode: "BC-1",
        productId: "p1",
        reservedForClientId: "c1",
        reservedForName: "X",
        reservedByUserId: "u1",
        product: { articleCode: "ART-1" },
      },
    ]);
    // Уже існує активне нагадування → пропускаємо.
    mockPrisma.mgrReminder.findFirst.mockResolvedValue({ id: "existing" });

    const res = await GET(req({ "x-cron-secret": SECRET }));
    const body = await res.json();
    expect(body.bronCreated).toBe(0);
    expect(mockPrisma.mgrReminder.create).not.toHaveBeenCalled();
    expect(mockPrisma.lot.update).not.toHaveBeenCalled();
  });

  // ─── Детектор B: з'явилось відео ───────────────────────────────────────────
  it("fires a video watch when the lot's videoUrl is now present", async () => {
    mockPrisma.mgrReminder.findMany.mockResolvedValue([
      {
        id: "w1",
        lotId: "lot9",
        productId: null,
        client: { name: "Клієнт А" },
      },
    ]);
    mockPrisma.lot.findMany.mockResolvedValue([
      {
        id: "lot9",
        barcode: "BC-9",
        videoUrl: "https://youtu.be/abc",
        product: { articleCode: "ART-9" },
      },
    ]);

    const res = await GET(req({ "x-cron-secret": SECRET }));
    const body = await res.json();
    expect(body.videoFired).toBe(1);

    expect(mockPrisma.mgrReminder.update).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.mgrReminder.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: {
        actionType: string;
        source: string;
        periodicity: string;
        body: string;
      };
    };
    expect(arg.where.id).toBe("w1");
    expect(arg.data.actionType).toBe("viber_video");
    expect(arg.data.source).toBe("auto_video");
    expect(arg.data.periodicity).toBe("none");
    expect(arg.data.body).toContain("ART-9");
    expect(arg.data.body).toContain("BC-9");
    expect(arg.data.body).toContain("Клієнт А");
    expect(arg.data.body).toContain("з'явилось відео");
  });

  it("leaves a video watch untouched when the video is still absent", async () => {
    mockPrisma.mgrReminder.findMany.mockResolvedValue([
      { id: "w1", lotId: null, productId: "p5", client: { name: "Б" } },
    ]);
    mockPrisma.product.findMany.mockResolvedValue([
      { id: "p5", articleCode: "ART-5", videoUrl: null },
    ]);

    const res = await GET(req({ "x-cron-secret": SECRET }));
    const body = await res.json();
    expect(body.videoFired).toBe(0);
    expect(mockPrisma.mgrReminder.update).not.toHaveBeenCalled();
  });

  it("fires a product-scoped video watch when Product.videoUrl appears", async () => {
    mockPrisma.mgrReminder.findMany.mockResolvedValue([
      { id: "w2", lotId: null, productId: "p7", client: { name: "В" } },
    ]);
    mockPrisma.product.findMany.mockResolvedValue([
      { id: "p7", articleCode: "ART-7", videoUrl: "https://youtu.be/xyz" },
    ]);

    const res = await GET(req({ "x-cron-secret": SECRET }));
    const body = await res.json();
    expect(body.videoFired).toBe(1);
    const arg = mockPrisma.mgrReminder.update.mock.calls[0]?.[0] as {
      data: { actionType: string; body: string };
    };
    expect(arg.data.actionType).toBe("viber_video");
    // Без лоту — мішок «—» у тексті.
    expect(arg.data.body).toContain("мішку —");
  });
});
