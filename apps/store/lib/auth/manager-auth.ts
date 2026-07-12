import { prisma } from "@ltex/db";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, type ManagerRole, ADMIN_ROLES } from "./jwt";

export const MANAGER_ACCESS_COOKIE = "ltex_mgr_access";
export const MANAGER_REFRESH_COOKIE = "ltex_mgr_refresh";

// Обидві кукі живуть на шляху "/" (раніше refresh була прив'язана до
// /api/v1/manager/auth). Це потрібно, щоб middleware на сторінках /manager/*
// міг прочитати refresh-токен і тихо оновити короткоживучий access-токен —
// інакше браузер просто не надсилав би refresh-куку на сторінкові запити.
export const MANAGER_COOKIE_PATH = "/";

/**
 * Виставляє сесійні кукі авторизації менеджера.
 *
 * Це СЕСІЙНІ кукі (без maxAge/expires): браузер тримає їх, доки відкритий, і
 * прибирає при закритті браузера. Короткий access-токен (15 хв) при цьому
 * непомітно поновлюється middleware через refresh-токен, тож користувача НЕ
 * викидає на екран входу під час роботи. Повторний вхід потрібен лише після
 * закриття браузера/компʼютера.
 */
export function setManagerAuthCookies(
  res: NextResponse,
  accessToken: string,
  refreshToken: string,
): void {
  const base = {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: MANAGER_COOKIE_PATH,
  };
  res.cookies.set(MANAGER_ACCESS_COOKIE, accessToken, base);
  res.cookies.set(MANAGER_REFRESH_COOKIE, refreshToken, base);
}

/** Прибирає обидві кукі авторизації (вихід із системи). */
export function clearManagerAuthCookies(res: NextResponse): void {
  const base = {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: MANAGER_COOKIE_PATH,
  };
  res.cookies.set(MANAGER_ACCESS_COOKIE, "", base);
  res.cookies.set(MANAGER_REFRESH_COOKIE, "", base);
}

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

/**
 * Єдине визначення «адміністратора» для всієї менеджерки (ТЗ 8.0 B3).
 * admin і owner мають повний доступ (owner логується з isOwnerAction=true).
 * Раніше перевірки були розкидані (ADMIN_ROLES / role==="admin" / requireRole);
 * використовуй ці хелпери для будь-якої admin-only дії, зокрема черги видалень.
 */
export function isAdminRole(role: ManagerRole): boolean {
  return ADMIN_ROLES.has(role);
}

/** Повертає користувача лише якщо він admin або owner, інакше null. */
export async function requireAdmin(
  req?: NextRequest,
): Promise<CurrentManager | null> {
  const user = await getCurrentUser(req);
  if (!user) return null;
  if (!isAdminRole(user.role)) return null;
  return user;
}
