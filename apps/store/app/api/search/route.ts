import { NextRequest, NextResponse } from "next/server";
import { autocompleteSearch } from "@/lib/catalog";

// Simple in-memory rate limiter: 20 requests/min per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (entry.count >= 20) return false;
  entry.count++;
  return true;
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const query = request.nextUrl.searchParams.get("q");
  if (!query || query.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  const results = await autocompleteSearch(query);

  // Convert BigInt rank to number for JSON serialization
  const serialized = results.map((r) => ({
    ...r,
    rank: Number(r.rank),
  }));

  return NextResponse.json({ results: serialized });
}
