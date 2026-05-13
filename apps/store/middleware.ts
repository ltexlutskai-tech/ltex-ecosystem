import { updateSession } from "@/lib/supabase/middleware";
import { managerGuard } from "@/middleware-manager";
import { NextResponse, type NextRequest } from "next/server";

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
