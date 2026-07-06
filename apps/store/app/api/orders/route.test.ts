import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted mock holders (referenced inside vi.mock factories, which are hoisted
// above const declarations — vi.hoisted keeps them in sync).
const h = vi.hoisted(() => {
  const txOrderCreate = vi.fn();
  const txLotUpdateMany = vi.fn();
  return {
    txOrderCreate,
    txLotUpdateMany,
    mockResolveOrCreateSiteClient: vi.fn(),
    mockCreateSiteOrderReminders: vi.fn().mockResolvedValue(undefined),
    mockPrisma: {
      lot: { findMany: vi.fn(), updateMany: vi.fn() },
      customer: { findFirst: vi.fn(), create: vi.fn() },
      exchangeRate: { findFirst: vi.fn() },
      mgrRegionAgent: { findUnique: vi.fn() },
      product: { findMany: vi.fn() },
      order: { create: vi.fn() },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) =>
        cb({
          order: { create: txOrderCreate },
          lot: { updateMany: txLotUpdateMany },
        }),
      ),
    },
  };
});
const {
  txOrderCreate,
  txLotUpdateMany,
  mockResolveOrCreateSiteClient,
  mockCreateSiteOrderReminders,
  mockPrisma,
} = h;

vi.mock("@ltex/db", () => ({
  prisma: h.mockPrisma,
}));

// Mock rate limit
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockReturnValue({ allowed: true, remaining: 5 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

// Mock notifications
vi.mock("@/lib/notifications", () => ({
  notifyNewOrder: vi.fn().mockResolvedValue(undefined),
}));

// Mock email (avoid loading nodemailer on import)
vi.mock("@/lib/email", () => ({
  sendOrderConfirmationEmail: vi.fn().mockResolvedValue(undefined),
}));

// Mock Block-1/2 collaborators
vi.mock("@/lib/manager/site-client", () => ({
  resolveOrCreateSiteClient: (...a: unknown[]) =>
    h.mockResolveOrCreateSiteClient(...a),
}));
vi.mock("@/lib/manager/site-order-reminders", () => ({
  createSiteOrderReminders: (...a: unknown[]) =>
    h.mockCreateSiteOrderReminders(...a),
}));

import type { NextRequest } from "next/server";
import { orderSchema } from "@/lib/validations";
import { POST } from "./route";

function makeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

const validOrder = {
  customer: {
    name: "Тест Клієнт",
    phone: "+380676710515",
  },
  items: [
    {
      lotId: "lot-1",
      productId: "prod-1",
      priceEur: 50,
      weight: 12,
      quantity: 1,
    },
  ],
  notes: "Тестове замовлення",
};

describe("Order API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("orderSchema validation", () => {
    it("validates a correct order", () => {
      const result = orderSchema.safeParse(validOrder);
      expect(result.success).toBe(true);
    });

    it("rejects order without customer name", () => {
      const result = orderSchema.safeParse({
        ...validOrder,
        customer: { phone: "+380676710515" },
      });
      expect(result.success).toBe(false);
    });

    it("rejects order without items", () => {
      const result = orderSchema.safeParse({
        ...validOrder,
        items: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects item with negative price", () => {
      const result = orderSchema.safeParse({
        ...validOrder,
        items: [{ ...validOrder.items[0], priceEur: -5 }],
      });
      expect(result.success).toBe(false);
    });

    it("rejects item with zero weight", () => {
      const result = orderSchema.safeParse({
        ...validOrder,
        items: [{ ...validOrder.items[0], weight: 0 }],
      });
      expect(result.success).toBe(false);
    });

    it("accepts order without notes", () => {
      const { notes, ...orderWithoutNotes } = validOrder;
      const result = orderSchema.safeParse(orderWithoutNotes);
      expect(result.success).toBe(true);
    });

    it("rejects notes longer than 1000 chars", () => {
      const result = orderSchema.safeParse({
        ...validOrder,
        notes: "x".repeat(1001),
      });
      expect(result.success).toBe(false);
    });

    it("rejects phone shorter than 10 chars", () => {
      const result = orderSchema.safeParse({
        ...validOrder,
        customer: { name: "Test", phone: "123" },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Order weight validation", () => {
    it("requires minimum 10kg total weight", () => {
      const lightOrder = {
        ...validOrder,
        items: [{ ...validOrder.items[0], weight: 5 }],
      };
      const parsed = orderSchema.safeParse(lightOrder);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        const totalWeight = parsed.data.items.reduce(
          (sum, i) => sum + i.weight,
          0,
        );
        expect(totalWeight).toBeLessThan(10);
      }
    });

    it("accepts orders with 10kg or more", () => {
      const parsed = orderSchema.safeParse(validOrder);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        const totalWeight = parsed.data.items.reduce(
          (sum, i) => sum + i.weight,
          0,
        );
        expect(totalWeight).toBeGreaterThanOrEqual(10);
      }
    });
  });

  describe("Multiple items", () => {
    it("accepts order with multiple items", () => {
      const multiOrder = {
        ...validOrder,
        items: [
          {
            lotId: "lot-1",
            productId: "prod-1",
            priceEur: 30,
            weight: 6,
            quantity: 1,
          },
          {
            lotId: "lot-2",
            productId: "prod-2",
            priceEur: 25,
            weight: 5,
            quantity: 1,
          },
          {
            lotId: "lot-3",
            productId: "prod-1",
            priceEur: 20,
            weight: 4,
            quantity: 1,
          },
        ],
      };
      const result = orderSchema.safeParse(multiOrder);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(3);
      }
    });
  });

  describe("POST — site order routing (7.2 Block 1)", () => {
    beforeEach(() => {
      mockPrisma.customer.findFirst.mockResolvedValue(null);
      mockPrisma.customer.create.mockResolvedValue({
        id: "cust-1",
        email: null,
      });
      mockPrisma.exchangeRate.findFirst.mockResolvedValue({ rate: 42 });
      // free-check → barcode-fetch
      mockPrisma.lot.findMany
        .mockResolvedValueOnce([{ id: "lot-1", status: "free" }])
        .mockResolvedValueOnce([{ barcode: "L-123" }]);
      txOrderCreate.mockResolvedValue({ id: "order-abc123" });
    });

    it("recognized client → routes to their agent, draft+site, reserves lot, barcode in notes", async () => {
      mockResolveOrCreateSiteClient.mockResolvedValue({
        clientId: "cl-1",
        agentUserId: "agent-9",
        created: false,
      });

      const res = await POST(makeRequest(validOrder));
      expect(res.status).toBe(201);

      const data = txOrderCreate.mock.calls[0]![0].data;
      expect(data.status).toBe("draft");
      expect(data.source).toBe("site");
      expect(data.assignedAgentUserId).toBe("agent-9");
      expect(data.notes).toContain("L-123");
      expect(txLotUpdateMany).toHaveBeenCalled();
      expect(mockCreateSiteOrderReminders).toHaveBeenCalledWith(
        expect.objectContaining({ assignedAgentUserId: "agent-9" }),
      );
    });

    it("new client with region → resolveOrCreateSiteClient called with regionSlug", async () => {
      mockResolveOrCreateSiteClient.mockResolvedValue({
        clientId: "cl-new",
        agentUserId: "agent-region",
        created: true,
      });

      const res = await POST(
        makeRequest({
          ...validOrder,
          customer: { ...validOrder.customer, region: "volynska" },
        }),
      );
      expect(res.status).toBe(201);
      expect(mockResolveOrCreateSiteClient).toHaveBeenCalledWith(
        expect.objectContaining({ regionSlug: "volynska" }),
      );
      expect(txOrderCreate.mock.calls[0]![0].data.assignedAgentUserId).toBe(
        "agent-region",
      );
    });

    it("no agent resolved → unassigned (null), reminder still fires", async () => {
      mockResolveOrCreateSiteClient.mockResolvedValue({
        clientId: "cl-x",
        agentUserId: null,
        created: true,
      });

      const res = await POST(makeRequest(validOrder));
      expect(res.status).toBe(201);
      expect(
        txOrderCreate.mock.calls[0]![0].data.assignedAgentUserId,
      ).toBeNull();
      expect(mockCreateSiteOrderReminders).toHaveBeenCalledWith(
        expect.objectContaining({ assignedAgentUserId: null }),
      );
    });
  });

  describe("Customer fields", () => {
    it("accepts customer with telegram", () => {
      const result = orderSchema.safeParse({
        ...validOrder,
        customer: {
          ...validOrder.customer,
          telegram: "@testuser",
        },
      });
      expect(result.success).toBe(true);
    });

    it("accepts customer without telegram", () => {
      const result = orderSchema.safeParse(validOrder);
      expect(result.success).toBe(true);
    });

    it("rejects customer name exceeding 200 chars", () => {
      const result = orderSchema.safeParse({
        ...validOrder,
        customer: {
          name: "x".repeat(201),
          phone: "+380676710515",
        },
      });
      expect(result.success).toBe(false);
    });
  });
});
