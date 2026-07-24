import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const VALID_SECRET = "a".repeat(48);
process.env.MANAGER_JWT_SECRET = VALID_SECRET;

const { mockPrisma, getCurrentUserMock } = vi.hoisted(() => ({
  mockPrisma: {
    bankFeedAccount: { findUnique: vi.fn(), update: vi.fn() },
    mgrBankAccount: { findUnique: vi.fn() },
  },
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@ltex/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...a: unknown[]) => getCurrentUserMock(...a),
}));

import { POST } from "./route";

const BOOKKEEPER = { id: "u-bk", fullName: "Бухгалтер", role: "bookkeeper" };

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/manager/bank-feed/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue(BOOKKEEPER);
  mockPrisma.bankFeedAccount.findUnique.mockResolvedValue({ id: "feed-1" });
  mockPrisma.mgrBankAccount.findUnique.mockResolvedValue({ id: "acc-1" });
  mockPrisma.bankFeedAccount.update.mockResolvedValue({});
});

describe("POST /api/v1/manager/bank-feed/link", () => {
  it("401 без авторизації", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(
      postReq({ feedAccountId: "feed-1", mgrBankAccountId: "acc-1" }),
    );
    expect(res.status).toBe(401);
  });

  it("403 для менеджера (не фінансовий контур)", async () => {
    getCurrentUserMock.mockResolvedValueOnce({
      id: "u-m",
      fullName: "Менеджер",
      role: "manager",
    });
    const res = await POST(
      postReq({ feedAccountId: "feed-1", mgrBankAccountId: "acc-1" }),
    );
    expect(res.status).toBe(403);
    expect(mockPrisma.bankFeedAccount.update).not.toHaveBeenCalled();
  });

  it("400 на некоректне тіло", async () => {
    const res = await POST(postReq({ feedAccountId: "" }));
    expect(res.status).toBe(400);
  });

  it("404 коли рахунок фіда не знайдено", async () => {
    mockPrisma.bankFeedAccount.findUnique.mockResolvedValueOnce(null);
    const res = await POST(
      postReq({ feedAccountId: "missing", mgrBankAccountId: "acc-1" }),
    );
    expect(res.status).toBe(404);
  });

  it("привʼязує рахунок обліку", async () => {
    const res = await POST(
      postReq({ feedAccountId: "feed-1", mgrBankAccountId: "acc-1" }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.bankFeedAccount.update).toHaveBeenCalledWith({
      where: { id: "feed-1" },
      data: { mgrBankAccountId: "acc-1" },
    });
  });

  it("null → відвʼязка без перевірки довідника", async () => {
    const res = await POST(
      postReq({ feedAccountId: "feed-1", mgrBankAccountId: null }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.mgrBankAccount.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.bankFeedAccount.update).toHaveBeenCalledWith({
      where: { id: "feed-1" },
      data: { mgrBankAccountId: null },
    });
  });
});
