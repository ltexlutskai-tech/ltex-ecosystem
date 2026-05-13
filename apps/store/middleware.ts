import { updateSession } from "@/lib/supabase/middleware";
import { managerGuard } from "@/middleware-manager";
import { NextResponse, type NextRequest } from "next/server";

// Manager auth (lib/auth/jwt.ts) uses Node.js `crypto` which is not available
// in the Edge Runtime — without this opt-in middleware silently returns
// empty 0-byte responses on /manager/* routes. Requires
// experimental.nodeMiddleware in next.config.js until Next.js 16 ships it
// as stable.
export const runtime = "nodejs";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/manager")) {
    return managerGuard(request);
  }
  if (path.startsWith("/admin")) {
    return updateSession(request);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/manager/:path*"],
};
