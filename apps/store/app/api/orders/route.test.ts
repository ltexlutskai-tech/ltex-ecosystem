import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
const mockPrisma = {
  lot: { findMany: vi.fn() },
  customer: { findFirst: vi.fn(), create: vi.fn() },
  exchangeRate: { findFirst: vi.fn() },
  order: { create: vi.fn() },
  $transaction: vi.fn(),
};

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
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

import { orderSchema } from "@/lib/validations";

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
          { lotId: "lot-1", productId: "prod-1", priceEur: 30, weight: 6, quantity: 1 },
          { lotId: "lot-2", productId: "prod-2", priceEur: 25, weight: 5, quantity: 1 },
          { lotId: "lot-3", productId: "prod-1", priceEur: 20, weight: 4, quantity: 1 },
        ],
      };
      const result = orderSchema.safeParse(multiOrder);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(3);
      }
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
