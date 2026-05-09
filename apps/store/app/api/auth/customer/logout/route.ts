import { NextResponse } from "next/server";
import { clearCustomerCookie } from "@/lib/customer-auth";

export async function POST() {
  await clearCustomerCookie();
  return NextResponse.json({ ok: true });
}

// Allow form-based logout (non-JS fallback) to redirect home.
export async function GET(request: Request) {
  await clearCustomerCookie();
  const url = new URL(request.url);
  return NextResponse.redirect(new URL("/", url.origin));
}
