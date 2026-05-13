import { prisma } from "@ltex/db";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { verifyAccessToken, type ManagerRole } from "./jwt";

export const MANAGER_ACCESS_COOKIE = "ltex_mgr_access";
export const MANAGER_REFRESH_COOKIE = "ltex_mgr_refresh";

export interface CurrentManager {
  id: string;
  email: string;
  fullName: string;
  role: ManagerRole;
  isActive: boolean;
  code1C: string | null;
  telegramLinked: boolean;
  notifyChannels: string[];
  lastSeenAt: Date | null;
}

export async function getCurrentUser(
  req?: NextRequest,
): Promise<CurrentManager | null> {
  const token = await readToken(req);
  if (!token) return null;
  const payload = verifyAccessToken(token);
  if (!payload) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      isActive: true,
      code1C: true,
      telegramChatId: true,
      notifyChannels: true,
      lastSeenAt: true,
    },
  });
  if (!user || !user.isActive) return null;
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
    code1C: user.code1C,
    telegramLinked: user.telegramChatId !== null,
    notifyChannels: user.notifyChannels,
    lastSeenAt: user.lastSeenAt,
  };
}

async function readToken(req?: NextRequest): Promise<string | null> {
  const auth = req?.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m && m[1]) return m[1];

  try {
    const cookieStore = await cookies();
    const c = cookieStore.get(MANAGER_ACCESS_COOKIE);
    return c?.value ?? null;
  } catch {
    return null;
  }
}

export async function requireRole(
  roles: ManagerRole[],
  req?: NextRequest,
): Promise<CurrentManager | null> {
  const user = await getCurrentUser(req);
  if (!user) return null;
  if (!roles.includes(user.role)) return null;
  return user;
}
