import { NextRequest, NextResponse } from "next/server";
import { autocompleteSearch } from "@/lib/catalog";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const limit = rateLimit(`search:${ip}`, { windowMs: 60_000, max: 20 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const query = request.nextUrl.searchParams.get("q");
  if (!query || query.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await autocompleteSearch(query);

    // Convert BigInt rank to number for JSON serialization
    const serialized = results.map((r) => ({
      ...r,
      rank: Number(r.rank),
    }));

    return NextResponse.json({ results: serialized });
  } catch {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
