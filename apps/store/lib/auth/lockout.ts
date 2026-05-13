import { prisma } from "@ltex/db";

export const MAX_FAILS = 5;
export const LOCKOUT_MIN = 15;

export async function isLocked(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { lockedUntil: true },
  });
  if (!u?.lockedUntil) return false;
  return u.lockedUntil > new Date();
}

export async function recordFailedLogin(userId: string): Promise<void> {
  const u = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true },
  });
  if (u.failedLoginCount >= MAX_FAILS) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        lockedUntil: new Date(Date.now() + LOCKOUT_MIN * 60 * 1000),
      },
    });
  }
}

export async function clearFailedLogins(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockedUntil: null },
  });
}
