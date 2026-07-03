import { describe, it, expect, vi, beforeEach } from "vitest";

const { getCurrentUserMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
}));

vi.mock("@/lib/auth/manager-auth", () => ({
  getCurrentUser: (...args: unknown[]) => getCurrentUserMock(...args),
}));

import { requireAdmin } from "./admin-auth";

function user(role: string) {
  return { id: "u1", role };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireAdmin", () => {
  it("returns the user id for role=admin", async () => {
    getCurrentUserMock.mockResolvedValue(user("admin"));
    await expect(requireAdmin()).resolves.toBe("u1");
  });

  it("returns the user id for role=owner", async () => {
    getCurrentUserMock.mockResolvedValue(user("owner"));
    await expect(requireAdmin()).resolves.toBe("u1");
  });

  it("throws for role=manager", async () => {
    getCurrentUserMock.mockResolvedValue(user("manager"));
    await expect(requireAdmin()).rejects.toThrow(
      "Unauthorized: admin access required",
    );
  });

  it("throws for role=warehouse", async () => {
    getCurrentUserMock.mockResolvedValue(user("warehouse"));
    await expect(requireAdmin()).rejects.toThrow(
      "Unauthorized: admin access required",
    );
  });

  it("throws when there is no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow(
      "Unauthorized: admin access required",
    );
  });
});
