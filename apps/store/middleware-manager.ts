import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { MANAGER_ACCESS_COOKIE } from "@/lib/auth/manager-auth";
import { tryRefreshSession } from "@/lib/auth/session-refresh";

const PUBLIC_PATHS = [
  "/manager/login",
  "/manager/forgot",
  "/manager/reset",
] as const;

function isPublic(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

export async function managerGuard(req: NextRequest): Promise<NextResponse> {
  const path = req.nextUrl.pathname;
  const cookie = req.cookies.get(MANAGER_ACCESS_COOKIE)?.value;
  let payload = null;
  try {
    payload = cookie ? verifyAccessToken(cookie) : null;
  } catch {
    payload = null;
  }

  if (isPublic(path)) {
    if (payload) {
      const url = req.nextUrl.clone();
      url.pathname = "/manager";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!payload) {
    const refreshed = await tryRefreshSession(req);
    if (refreshed) return refreshed;

    const url = req.nextUrl.clone();
    url.pathname = "/manager/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
