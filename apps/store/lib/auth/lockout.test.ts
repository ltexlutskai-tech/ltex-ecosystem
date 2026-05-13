import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@ltex/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@ltex/db";
import {
  isLocked,
  recordFailedLogin,
  clearFailedLogins,
  MAX_FAILS,
} from "./lockout";

const mockUser = prisma.user as unknown as {
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("lockout", () => {
  it("isLocked returns false when no lockedUntil", async () => {
    mockUser.findUnique.mockResolvedValue({ lockedUntil: null });
    expect(await isLocked("u1")).toBe(false);
  });

  it("isLocked returns true when lockedUntil is in the future", async () => {
    mockUser.findUnique.mockResolvedValue({
      lockedUntil: new Date(Date.now() + 60_000),
    });
    expect(await isLocked("u1")).toBe(true);
  });

  it("isLocked returns false when lockedUntil is in the past", async () => {
    mockUser.findUnique.mockResolvedValue({
      lockedUntil: new Date(Date.now() - 60_000),
    });
    expect(await isLocked("u1")).toBe(false);
  });

  it("recordFailedLogin increments counter, does not lock until threshold", async () => {
    mockUser.update.mockResolvedValueOnce({ failedLoginCount: 1 });
    await recordFailedLogin("u1");
    expect(mockUser.update).toHaveBeenCalledTimes(1);
    expect(mockUser.update.mock.calls[0]?.[0]?.data).toEqual({
      failedLoginCount: { increment: 1 },
    });
  });

  it("recordFailedLogin locks user when count reaches MAX_FAILS", async () => {
    mockUser.update
      .mockResolvedValueOnce({ failedLoginCount: MAX_FAILS })
      .mockResolvedValueOnce({});
    await recordFailedLogin("u1");
    expect(mockUser.update).toHaveBeenCalledTimes(2);
    const lockCall = mockUser.update.mock.calls[1]?.[0];
    expect(lockCall?.data?.lockedUntil).toBeInstanceOf(Date);
    expect(
      (lockCall?.data?.lockedUntil as Date).getTime() - Date.now(),
    ).toBeGreaterThan(14 * 60 * 1000);
  });

  it("clearFailedLogins resets counter and lockedUntil", async () => {
    mockUser.update.mockResolvedValueOnce({});
    await clearFailedLogins("u1");
    expect(mockUser.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  });
});
