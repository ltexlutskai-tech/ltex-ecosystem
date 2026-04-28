import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const isRelaxed = process.env.CSP_RELAXED === "true";

  const scriptSrc = isRelaxed
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : isDev
      ? `script-src 'self' 'unsafe-eval' 'nonce-${nonce}' 'strict-dynamic'`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://img.youtube.com https://i.ytimg.com",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co",
    "frame-src https://www.youtube.com https://youtube.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export async function middleware(request: NextRequest) {
  const nonce = generateNonce();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const isAdmin = request.nextUrl.pathname.startsWith("/admin");
  const response = isAdmin
    ? await updateSession(request)
    : NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set("x-nonce", nonce);
  response.headers.set("Content-Security-Policy", buildCsp(nonce));

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
