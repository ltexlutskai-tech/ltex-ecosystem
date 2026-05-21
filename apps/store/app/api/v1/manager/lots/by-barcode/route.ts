import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

/**
 * GET /api/v1/manager/lots/by-barcode?code=...[&priceTypeId=...]
 *
 * Резолв штрихкоду лота для скану ШК у формі Реалізації (Етап 2).
 * Знаходить `Lot` за `barcode` (унікальний) разом з товаром та його цінами,
 * щоб клієнт міг обчислити ціну/кг за обраним типом цін (`unitPriceForType`).
 *
 * Повертає також поля броні (`reserved*`), щоб клієнт вирішив, чи показувати
 * попередження «активна бронь не моя» (логіка попередження — на клієнті).
 *
 * Параметр `priceTypeId` приймається для майбутнього server-side розрахунку,
 * але зараз ціна обчислюється на клієнті з масиву `prices`.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const url = new URL(req.url);
  const code = (url.searchParams.get("code") ?? "").trim();
  if (!code) {
    return NextResponse.json({ error: "Не вказано ШК" }, { status: 400 });
  }

  const lot = await prisma.lot.findUnique({
    where: { barcode: code },
    include: {
      product: {
        select: {
          id: true,
          code1C: true,
          articleCode: true,
          name: true,
          slug: true,
          priceUnit: true,
          averageWeight: true,
          prices: {
            select: { priceType: true, amount: true, currency: true },
          },
        },
      },
    },
  });

  if (!lot) {
    return NextResponse.json(
      { error: "Не знайдено товар за ШК" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    lot: {
      id: lot.id,
      barcode: lot.barcode,
      weight: lot.weight,
      quantity: lot.quantity,
      status: lot.status,
      priceEur: lot.priceEur,
      reservedForClientId: lot.reservedForClientId,
      reservedForName: lot.reservedForName,
      reservedByUserId: lot.reservedByUserId,
      reservedByName: lot.reservedByName,
      reservedUntil: lot.reservedUntil ? lot.reservedUntil.toISOString() : null,
    },
    product: {
      id: lot.product.id,
      code1C: lot.product.code1C,
      articleCode: lot.product.articleCode,
      name: lot.product.name,
      slug: lot.product.slug,
      priceUnit: lot.product.priceUnit,
      averageWeight: lot.product.averageWeight,
    },
    prices: lot.product.prices.map((p) => ({
      priceType: p.priceType,
      amount: p.amount,
      currency: p.currency,
    })),
  });
}
