import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { guardInventoryWrite } from "@/lib/manager/inventory-live-guard";
import {
  patchInventoryItem,
  deleteInventoryItem,
} from "@/lib/manager/inventory-live";

/**
 * PATCH  /api/v1/manager/stock-documents/inventories/[id]/items/[itemId]
 *   body: { sector?, sectorId?, qtyActual? }
 * DELETE /api/v1/manager/stock-documents/inventories/[id]/items/[itemId]
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;
  const g = await guardInventoryWrite(req, id);
  if (!g.ok) return g.res;
  const body = await req.json().catch(() => ({}));
  const patch: {
    sector?: string | null;
    sectorId?: string | null;
    qtyActual?: number;
  } = {};
  if (body?.sector !== undefined)
    patch.sector = typeof body.sector === "string" ? body.sector : null;
  if (body?.sectorId !== undefined)
    patch.sectorId = typeof body.sectorId === "string" ? body.sectorId : null;
  if (body?.qtyActual !== undefined) patch.qtyActual = body.qtyActual ? 1 : 0;
  const updated = await patchInventoryItem(id, itemId, patch, g.user, prisma);
  if (!updated)
    return NextResponse.json({ error: "Рядок не знайдено" }, { status: 404 });
  return NextResponse.json({ item: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const { id, itemId } = await params;
  const g = await guardInventoryWrite(req, id);
  if (!g.ok) return g.res;
  const ok = await deleteInventoryItem(id, itemId, g.user, prisma);
  if (!ok)
    return NextResponse.json({ error: "Рядок не знайдено" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
