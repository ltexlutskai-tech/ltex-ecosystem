import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  BASE_PRICE_TYPE,
  SALE_PRICE_TYPE,
  newProductCutoff,
} from "@/lib/manager/prices";
import { buildProductShareText } from "@/lib/manager/share-message";
import { getCurrentRate } from "@/lib/exchange-rate";

/**
 * GET /api/v1/manager/reminders/[id]/viber-message
 *
 * Будує готовий рекламний текст (з відео-посиланням) для авто-нагадування
 * «з'явилось відео» (`actionType=viber_video`). Текст збирається на сервері
 * через `buildProductShareText` з товару/лоту нагадування + курсу EUR.
 *
 * Доступ: власник нагадування або admin. 404 коли нагадування/товар/лот
 * відсутні. Повертає `{ text }`.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;
  const reminder = await prisma.mgrReminder.findUnique({
    where: { id },
    select: { id: true, ownerUserId: true, lotId: true, productId: true },
  });
  if (!reminder) {
    return NextResponse.json(
      { error: "Нагадування не знайдено" },
      { status: 404 },
    );
  }
  if (reminder.ownerUserId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "Немає доступу" }, { status: 403 });
  }

  // Резолвимо товар (через лот або напряму) + дані лоту для тексту.
  let productId = reminder.productId;
  let lotWeight: number | null = null;
  let lotBarcode: string | null = null;
  let lotVideoUrl: string | null = null;

  if (reminder.lotId) {
    const lot = await prisma.lot.findUnique({
      where: { id: reminder.lotId },
      select: { productId: true, weight: true, barcode: true, videoUrl: true },
    });
    if (!lot) {
      return NextResponse.json({ error: "Лот не знайдено" }, { status: 404 });
    }
    productId = lot.productId;
    lotWeight = lot.weight;
    lotBarcode = lot.barcode;
    lotVideoUrl = lot.videoUrl;
  }

  if (!productId) {
    return NextResponse.json({ error: "Товар не знайдено" }, { status: 404 });
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      name: true,
      articleCode: true,
      description: true,
      videoUrl: true,
      createdAt: true,
      prices: {
        where: { priceType: { in: [BASE_PRICE_TYPE, SALE_PRICE_TYPE] } },
        select: { priceType: true, amount: true },
      },
    },
  });
  if (!product) {
    return NextResponse.json({ error: "Товар не знайдено" }, { status: 404 });
  }

  const base = product.prices.find((p) => p.priceType === BASE_PRICE_TYPE);
  const sale = product.prices.find((p) => p.priceType === SALE_PRICE_TYPE);
  const basePriceEur = base ? base.amount : null;
  const salePriceEur =
    sale && (basePriceEur === null || sale.amount < basePriceEur)
      ? sale.amount
      : null;

  const rateUah = await getCurrentRate();
  const isNew =
    product.createdAt.getTime() >= newProductCutoff(new Date()).getTime();

  const text = buildProductShareText({
    name: product.name,
    articleCode: product.articleCode,
    description: product.description,
    basePriceEur,
    salePriceEur,
    isNew,
    // Перевага відео-посилання лоту (якщо є), інакше — товара.
    videoUrl: lotVideoUrl ?? product.videoUrl,
    lot:
      lotWeight != null && lotBarcode != null
        ? { weight: lotWeight, barcode: lotBarcode }
        : null,
    rateUah,
  });

  return NextResponse.json({ text });
}
