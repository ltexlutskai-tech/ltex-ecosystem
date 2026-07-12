import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { guardInventoryWrite } from "@/lib/manager/inventory-live-guard";
import {
  fillInventoryFromWarehouse,
  getInventoryLive,
} from "@/lib/manager/inventory-live";

/**
 * POST /api/v1/manager/stock-documents/inventories/[id]/fill
 *   body: { productId?: string }
 *
 * Заповнює документ мішками зі складу (усіма або одного товару).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guardInventoryWrite(req, id);
  if (!g.ok) return g.res;
  const body = await req.json().catch(() => ({}));
  const productId =
    typeof body?.productId === "string" && body.productId.trim()
      ? body.productId.trim()
      : null;
  const result = await fillInventoryFromWarehouse(
    id,
    { productId, user: g.user },
    prisma,
  );
  const doc = await getInventoryLive(id);
  return NextResponse.json({ ...result, doc });
}
