import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { parseBarcode } from "@/lib/warehouse/barcode-generator";

/**
 * GET /api/v1/manager/warehouse/barcode/lookup?code=...
 *
 * Розпізнавання штрихкоду L-TEX (← правки 2026-06-05):
 *   1. Парсимо штрихкод (паттерни L-INTERNAL / SUPPLIER)
 *   2. Якщо знайдено articleCode → шукаємо товар у Product за `articleCode`
 *   3. Повертаємо product + weight (якщо є у штрихкоді) + recognized=true
 *
 * Використовується у формі поступлення для smart-сканування: коли працівник
 * сканує штрихкод постачальника який зашиває артикул+вагу — система сама
 * розпізнає товар і вагу, додає рядок без зайвих дій.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }
  const url = new URL(req.url);
  const code = (url.searchParams.get("code") ?? "").trim();
  if (code.length < 2) {
    return NextResponse.json({ recognized: false });
  }

  const parsed = parseBarcode(code);

  if (!parsed.recognized || !parsed.articleCode) {
    return NextResponse.json({
      recognized: false,
      pattern: parsed.pattern,
      raw: parsed.raw,
    });
  }

  // Шукаємо товар за articleCode (точне співпадіння)
  const product = await prisma.product.findFirst({
    where: { articleCode: parsed.articleCode },
    select: { id: true, name: true, articleCode: true, code1C: true },
  });

  return NextResponse.json({
    recognized: true,
    pattern: parsed.pattern,
    raw: parsed.raw,
    articleCode: parsed.articleCode,
    weight: parsed.weight,
    product,
  });
}
