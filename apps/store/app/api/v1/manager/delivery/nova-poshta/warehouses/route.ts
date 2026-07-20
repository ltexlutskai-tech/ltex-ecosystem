import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getWarehouses } from "@/lib/delivery/nova-poshta";

/**
 * GET /api/v1/manager/delivery/nova-poshta/warehouses?cityRef=...&q=...
 *
 * Проксі до NP `Address.getWarehouses`.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const cityRef = (params.get("cityRef") ?? "").trim();
  if (!cityRef) {
    return NextResponse.json(
      { error: "cityRef обов'язковий" },
      { status: 400 },
    );
  }
  const q = (params.get("q") ?? "").trim();

  const warehouses = await getWarehouses(cityRef, q);
  return NextResponse.json({ warehouses });
}
