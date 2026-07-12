import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { guardInventoryWrite } from "@/lib/manager/inventory-live-guard";
import { scanInventoryBag } from "@/lib/manager/inventory-live";

/**
 * POST /api/v1/manager/stock-documents/inventories/[id]/scan
 *   body: { barcode: string, sector?: string|null, sectorId?: string|null }
 *
 * Скан мішка: Факт=1 (наявний) або новий рядок надлишку. `sector`/`sectorId`
 * — активний сектор пристрою (мішок потрапляє у цей сектор).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guardInventoryWrite(req, id);
  if (!g.ok) return g.res;
  const body = await req.json().catch(() => ({}));
  const barcode = typeof body?.barcode === "string" ? body.barcode.trim() : "";
  if (!barcode)
    return NextResponse.json({ error: "Не вказано ШК" }, { status: 400 });
  const sector =
    typeof body?.sector === "string" && body.sector.trim()
      ? body.sector.trim()
      : null;
  const sectorId =
    typeof body?.sectorId === "string" && body.sectorId.trim()
      ? body.sectorId.trim()
      : null;
  const result = await scanInventoryBag(
    id,
    barcode,
    { sector, sectorId, user: g.user },
    prisma,
  );
  return NextResponse.json(result);
}
