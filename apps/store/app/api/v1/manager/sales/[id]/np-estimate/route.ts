import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import {
  getDocumentPrice,
  getDocumentDeliveryDate,
} from "@/lib/delivery/nova-poshta";

/**
 * GET /api/v1/manager/sales/[id]/np-estimate
 *
 * Попередній розрахунок Нової Пошти для реалізації ДО / навколо створення ТТН:
 * орієнтовна вартість доставки + комісія за контроль оплати + орієнтовна дата
 * доставки. Показується на картці реалізації (працює і до, і після ТТН).
 *
 * Будь-який авторизований менеджер може розрахувати (без спец-гейту). Помилки
 * НП — не фатальні: помилка ціни → `{ ok:false, error }`, помилка дати → лише
 * `deliveryDate:null` (решта повертається).
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

  const sale = await prisma.sale.findUnique({
    where: { id },
    select: {
      npCityRef: true,
      npDeliveryType: true,
      cashOnDelivery: true,
      codAmountUah: true,
      declaredValueUah: true,
      declaredValueEnabled: true,
      totalUah: true,
      items: { select: { weight: true } },
    },
  });

  if (!sale) {
    return NextResponse.json(
      { error: "Реалізацію не знайдено" },
      { status: 404 },
    );
  }

  if (!sale.npCityRef) {
    return NextResponse.json(
      { error: "Спершу оберіть місто й відділення Нової Пошти у реалізації." },
      { status: 400 },
    );
  }

  const citySenderRef = process.env.NP_SENDER_CITY_REF;
  if (!citySenderRef) {
    return NextResponse.json(
      { error: "Не налаштовано місто відправника НП (NP_SENDER_CITY_REF)." },
      { status: 400 },
    );
  }

  const weight = Math.max(
    0.1,
    sale.items.reduce((sum, it) => sum + it.weight, 0),
  );
  const serviceType =
    sale.npDeliveryType === "WarehouseDoors"
      ? "WarehouseDoors"
      : "WarehouseWarehouse";
  const cost = Math.max(
    1,
    (sale.declaredValueEnabled
      ? (sale.declaredValueUah ?? sale.totalUah)
      : sale.totalUah) || 1,
  );
  const redelivery =
    sale.cashOnDelivery && (sale.codAmountUah ?? 0) > 0
      ? (sale.codAmountUah ?? undefined)
      : undefined;

  const [priceRes, dateRes] = await Promise.all([
    getDocumentPrice({
      citySenderRef,
      cityRecipientRef: sale.npCityRef,
      weight,
      serviceType,
      cost,
      cargoType: "Cargo",
      seatsAmount: 1,
      redeliveryCalculate: redelivery,
    }),
    getDocumentDeliveryDate({
      citySenderRef,
      cityRecipientRef: sale.npCityRef,
      serviceType,
    }),
  ]);

  if ("error" in priceRes) {
    return NextResponse.json({ ok: false, error: priceRes.error });
  }

  const deliveryDate = "error" in dateRes ? null : dateRes.deliveryDate;

  return NextResponse.json({
    ok: true,
    costUah: priceRes.costUah,
    redeliveryCostUah: priceRes.redeliveryCostUah,
    deliveryDate,
  });
}
