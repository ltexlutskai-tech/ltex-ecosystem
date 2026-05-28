import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    mgrClientPhone: { findFirst: vi.fn() },
    mgrClient: { findFirst: vi.fn(), findUnique: vi.fn() },
    customer: { findFirst: vi.fn() },
  },
}));

vi.mock("@ltex/db", () => ({
  prisma: mockPrisma,
  Prisma: {},
}));

import { matchClientByPhone } from "./phone-match";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("matchClientByPhone", () => {
  it("returns null when phone cannot be normalized", async () => {
    const result = await matchClientByPhone("not-a-phone");
    expect(result).toBeNull();
    expect(mockPrisma.mgrClientPhone.findFirst).not.toHaveBeenCalled();
  });

  it("matches MgrClientPhone first (priority 1)", async () => {
    mockPrisma.mgrClientPhone.findFirst.mockResolvedValueOnce({
      clientId: "c1",
    });
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      id: "c1",
      agentUserId: "u1",
    });

    const result = await matchClientByPhone("0501234567");

    expect(result).toEqual({
      clientId: "c1",
      agentUserId: "u1",
      phone: "+380501234567",
    });
    // Priority 2/3 not consulted
    expect(mockPrisma.mgrClient.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.customer.findFirst).not.toHaveBeenCalled();
  });

  it("falls through to MgrClient.phonePrimary (priority 2)", async () => {
    mockPrisma.mgrClientPhone.findFirst.mockResolvedValueOnce(null);
    mockPrisma.mgrClient.findFirst.mockResolvedValueOnce({
      id: "c2",
      agentUserId: null,
    });

    const result = await matchClientByPhone("+380673456789");

    expect(result).toEqual({
      clientId: "c2",
      agentUserId: null,
      phone: "+380673456789",
    });
    expect(mockPrisma.customer.findFirst).not.toHaveBeenCalled();
  });

  it("falls through to Customer.phone → MgrClient via code1C (priority 3)", async () => {
    mockPrisma.mgrClientPhone.findFirst.mockResolvedValueOnce(null);
    mockPrisma.mgrClient.findFirst.mockResolvedValueOnce(null);
    mockPrisma.customer.findFirst.mockResolvedValueOnce({ code1C: "ABC-001" });
    mockPrisma.mgrClient.findUnique.mockResolvedValueOnce({
      id: "c3",
      agentUserId: "u3",
    });

    const result = await matchClientByPhone("380993334455");

    expect(result).toEqual({
      clientId: "c3",
      agentUserId: "u3",
      phone: "+380993334455",
    });
    // Verify customer lookup used the normalized form
    expect(mockPrisma.customer.findFirst).toHaveBeenCalledWith({
      where: { phone: "+380993334455" },
      select: { code1C: true },
    });
  });

  it("returns null when no level matches", async () => {
    mockPrisma.mgrClientPhone.findFirst.mockResolvedValueOnce(null);
    mockPrisma.mgrClient.findFirst.mockResolvedValueOnce(null);
    mockPrisma.customer.findFirst.mockResolvedValueOnce(null);

    const result = await matchClientByPhone("+380501112233");
    expect(result).toBeNull();
  });

  it("returns null when Customer has no code1C", async () => {
    mockPrisma.mgrClientPhone.findFirst.mockResolvedValueOnce(null);
    mockPrisma.mgrClient.findFirst.mockResolvedValueOnce(null);
    mockPrisma.customer.findFirst.mockResolvedValueOnce({ code1C: null });

    const result = await matchClientByPhone("0501234567");
    expect(result).toBeNull();
    expect(mockPrisma.mgrClient.findUnique).not.toHaveBeenCalled();
  });
});
