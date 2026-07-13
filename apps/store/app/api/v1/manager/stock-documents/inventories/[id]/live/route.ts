import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getInventoryLive } from "@/lib/manager/inventory-live";

// Динамічно — жива синхронізація (без кешування відповіді).
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/manager/stock-documents/inventories/[id]/live
 *
 * Знімок документа для синхронізації клієнтів (поллінг спільної роботи).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user)
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  const { id } = await params;
  const doc = await getInventoryLive(id);
  if (!doc) return NextResponse.json({ error: "Не знайдено" }, { status: 404 });
  return NextResponse.json(doc);
}
