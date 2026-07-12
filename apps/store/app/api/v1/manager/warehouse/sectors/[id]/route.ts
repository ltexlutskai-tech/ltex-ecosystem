import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { generateSectorBarcode } from "@/lib/warehouse/sector-barcode";

const WRITE_ROLES = new Set(["admin", "owner", "warehouse"]);

const patchSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  // "__generate__" → згенерувати новий; рядок → встановити свій (скан етикетки);
  // "" / null → прибрати ШК.
  barcode: z.string().trim().max(64).nullable().optional(),
  isActive: z.boolean().optional(),
});

/**
 * PATCH /api/v1/manager/warehouse/sectors/[id]
 *   body: { name?, barcode?("__generate__"|<code>|null), isActive? }
 *
 * Керування сектором: перейменування, присвоєння/генерація ШК, архів.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user)
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  if (!WRITE_ROLES.has(user.role))
    return NextResponse.json({ error: "Нема доступу" }, { status: 403 });
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Невірні дані" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
  if (parsed.data.barcode !== undefined) {
    if (parsed.data.barcode === "__generate__") {
      data.barcode = await generateSectorBarcode();
    } else {
      data.barcode = parsed.data.barcode || null;
    }
  }

  const updated = await prisma.warehouseSector
    .update({
      where: { id },
      data,
      select: { id: true, name: true, barcode: true, isActive: true },
    })
    .catch(() => null);
  if (!updated)
    return NextResponse.json(
      { error: "Сектор не знайдено або ШК зайнятий" },
      { status: 409 },
    );
  return NextResponse.json({ sector: updated });
}
