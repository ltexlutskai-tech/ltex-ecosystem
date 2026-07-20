import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { searchCities } from "@/lib/delivery/nova-poshta";

/**
 * GET /api/v1/manager/delivery/nova-poshta/cities?q=...
 *
 * Проксі до NP `Address.getCities`. Debounce — на клієнті.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ cities: [] });

  const cities = await searchCities(q);
  return NextResponse.json({ cities });
}
