import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { searchStreets } from "@/lib/delivery/nova-poshta";

/**
 * GET /api/v1/manager/np/streets?cityRef=...&q=...
 *
 * Проксі до NP `Address.getStreet` — пошук вулиць у місті для адресної доставки
 * «до дверей» (WarehouseDoors). Debounce — на клієнті.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const cityRef = (params.get("cityRef") ?? "").trim();
  const q = (params.get("q") ?? "").trim();
  if (!cityRef || q.length < 2) return NextResponse.json({ streets: [] });

  const streets = await searchStreets(cityRef, q);
  return NextResponse.json({ streets });
}
