import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, ADMIN_ROLES } from "@/lib/auth/jwt";
import { MANAGER_ACCESS_COOKIE } from "@/lib/auth/manager-auth";

const PUBLIC_PATHS = ["/admin/login"] as const;

function isPublic(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Admin-panel guard (session 6.1). Mirrors managerGuard but gates on
 * ADMIN_ROLES ({admin, owner}). Fail-closed: any request without a valid
 * admin session is redirected to /admin/login.
 */
export async function adminGuard(req: NextRequest): Promise<NextResponse> {
  const path = req.nextUrl.pathname;
  const cookie = req.cookies.get(MANAGER_ACCESS_COOKIE)?.value;
  let payload = null;
  try {
    payload = cookie ? verifyAccessToken(cookie) : null;
  } catch {
    payload = null;
  }

  const isAdmin = payload ? ADMIN_ROLES.has(payload.role) : false;

  if (isPublic(path)) {
    // Already signed in as admin — bounce away from the login page.
    if (isAdmin) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // No session at all → login.
  if (!payload) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Valid session but not an admin role → login with a hint (avoids a loop
  // because /admin/login is public and does not re-guard).
  if (!isAdmin) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "?forbidden=1";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
