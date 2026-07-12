import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { unitLabel, type WarehouseLot } from "@/lib/manager/inventory";

/**
 * GET /api/v1/manager/stock-documents/inventories/warehouse-stock
 *   [?q=...][&sector=...][&productId=...]
 *
 * Знімок мішків на складі для інвентаризації («Заповнити зі складу» / часткове
 * додавання позицій). Повертає всі лоти, що ФІЗИЧНО на складі — тобто НЕ продані
 * й НЕ архівні (заброньовані рахуються, бо мішок фізично лежить). Кожен рядок —
 * окремий мішок (унікальний ШК).
 *
 * Фільтри `q` (ШК/назва/артикул), `sector`, `productId` дозволяють набрати
 * підмножину (напр. лише один сектор чи один товар).
 */

const ALLOWED_ROLES = new Set([
  "manager",
  "senior_manager",
  "supervisor",
  "admin",
  "owner",
  "warehouse",
  "analyst",
]);

const MAX_ROWS = 5000;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  if (!ALLOWED_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Немає доступу" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const sector = (url.searchParams.get("sector") ?? "").trim();
  const productId = (url.searchParams.get("productId") ?? "").trim();

  const where: Record<string, unknown> = {
    // На складі фізично = не продано і не архів (бронь лишається на складі).
    status: { notIn: ["sold", "archived"] },
  };
  if (sector) where.sector = { contains: sector, mode: "insensitive" };
  if (productId) where.productId = productId;
  if (q)
    where.OR = [
      { barcode: { contains: q, mode: "insensitive" } },
      { product: { is: { name: { contains: q, mode: "insensitive" } } } },
      {
        product: { is: { articleCode: { contains: q, mode: "insensitive" } } },
      },
    ];

  const lots = await prisma.lot.findMany({
    where,
    select: {
      id: true,
      barcode: true,
      weight: true,
      quantity: true,
      priceEur: true,
      sector: true,
      productId: true,
      product: {
        select: {
          name: true,
          articleCode: true,
          priceUnit: true,
          quality: true,
        },
      },
    },
    orderBy: [{ sector: "asc" }, { barcode: "asc" }],
    take: MAX_ROWS + 1,
  });

  const truncated = lots.length > MAX_ROWS;
  const rows: WarehouseLot[] = lots.slice(0, MAX_ROWS).map((l) => ({
    lotId: l.id,
    barcode: l.barcode,
    productId: l.productId,
    productName: l.product?.name ?? "",
    articleCode: l.product?.articleCode ?? null,
    weight: l.weight,
    quantity: l.quantity,
    priceEur: l.priceEur,
    sector: l.sector,
    unitName: unitLabel(l.product?.priceUnit),
    quality: l.product?.quality ?? null,
  }));

  return NextResponse.json({ rows, total: rows.length, truncated });
}
