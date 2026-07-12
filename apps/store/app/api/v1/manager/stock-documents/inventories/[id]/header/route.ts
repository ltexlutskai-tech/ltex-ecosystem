import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { guardInventoryWrite } from "@/lib/manager/inventory-live-guard";
import { logInventory } from "@/lib/manager/inventory-live";

/**
 * PATCH /api/v1/manager/stock-documents/inventories/[id]/header
 *   body: { docDate?: string, notes?: string }
 *
 * Оновлення шапки (дата/коментар) без зачіпання рядків.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guardInventoryWrite(req, id);
  if (!g.ok) return g.res;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body?.docDate === "string") {
    const d = new Date(body.docDate);
    if (!Number.isNaN(d.getTime())) data.docDate = d;
  }
  if (body?.notes !== undefined)
    data.notes = typeof body.notes === "string" ? body.notes : null;
  if (Object.keys(data).length === 0) return NextResponse.json({ ok: true });
  await prisma.inventory.update({ where: { id }, data });
  await logInventory(prisma, id, g.user, "header", "Оновлено шапку документа");
  return NextResponse.json({ ok: true });
}
