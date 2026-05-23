import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMyClientCodes1C } from "@/lib/manager/sale-ownership";
import { PAYMENT_REMAINDER_DISCOUNT_THRESHOLD_EUR } from "@/lib/manager/cash-order";
import { discountRemainderSchema } from "@/lib/validations/manager-cash-order";

/**
 * Блок «Оплати / Каса» — Етап 2. «Дати знижку на залишок» (1С
 * `ДатьСкидкуНаОстаток`, `docs/PAYMENTS_BLOCK_AUDIT.md` §B останній абзац).
 *
 * Доступна лише коли `|залишок| ≤ ПорогЗадолженостиEUR` (5 €). За наявності
 * реалізації — зменшує найдорожчий рядок (`SaleItem` з max `priceEur`) на
 * залишок (пропорційно `pricePerKg`) і перераховує `Sale.totalEur/totalUah`
 * у транзакції. Standalone debtCorrection (без реалізації) — follow-up.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = discountRemainderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Гард порогу: знижку дозволено лише на дрібний залишок.
  if (Math.abs(input.remainderEur) > PAYMENT_REMAINDER_DISCOUNT_THRESHOLD_EUR) {
    return NextResponse.json(
      {
        error: `Знижка доступна лише коли залишок ≤ ${PAYMENT_REMAINDER_DISCOUNT_THRESHOLD_EUR} €`,
      },
      { status: 400 },
    );
  }

  if (!input.saleId) {
    return NextResponse.json(
      { error: "Знижка на залишок доступна лише для реалізації" },
      { status: 400 },
    );
  }

  const sale = await prisma.sale.findUnique({
    where: { id: input.saleId },
    select: {
      id: true,
      exchangeRateEur: true,
      customer: { select: { code1C: true } },
      items: {
        select: { id: true, priceEur: true, pricePerKg: true, weight: true },
      },
    },
  });
  if (!sale) {
    return NextResponse.json(
      { error: "Реалізацію не знайдено" },
      { status: 404 },
    );
  }

  // Ownership: manager — лише свої клієнти; admin — будь-кого.
  const myCodes = await getMyClientCodes1C(user);
  if (myCodes !== null) {
    if (!sale.customer.code1C || !myCodes.includes(sale.customer.code1C)) {
      return NextResponse.json({ error: "Не ваш клієнт" }, { status: 403 });
    }
  }

  if (sale.items.length === 0) {
    return NextResponse.json(
      { error: "У реалізації немає рядків" },
      { status: 404 },
    );
  }

  // Найдорожчий рядок (max priceEur) — на нього лягає знижка (1С §B).
  const top = sale.items.reduce((a, b) => (b.priceEur > a.priceEur ? b : a));
  const newPriceEur = round2(top.priceEur - input.remainderEur);
  // Пропорційно зменшуємо pricePerKg (зберігаємо співвідношення ціна/вага).
  const ratio = top.priceEur !== 0 ? newPriceEur / top.priceEur : 1;
  const newPricePerKg = round2(top.pricePerKg * ratio);

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.saleItem.update({
        where: { id: top.id },
        data: { priceEur: newPriceEur, pricePerKg: newPricePerKg },
      });

      const items = await tx.saleItem.findMany({
        where: { saleId: sale.id },
        select: { priceEur: true },
      });
      const totalEur = round2(items.reduce((s, it) => s + it.priceEur, 0));
      const totalUah = Math.round(totalEur * sale.exchangeRateEur);

      const updated = await tx.sale.update({
        where: { id: sale.id },
        data: { totalEur, totalUah },
        select: { id: true, totalEur: true, totalUah: true },
      });
      return updated;
    });

    return NextResponse.json(
      {
        id: result.id,
        totalEur: result.totalEur,
        totalUah: result.totalUah,
        discountedItemId: top.id,
      },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2003" || err.code === "P2025") {
        return NextResponse.json(
          { error: "Невалідні дані реалізації" },
          { status: 400 },
        );
      }
    }
    console.error("[L-TEX] Discount-remainder failed", {
      saleId: input.saleId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка нарахування знижки" },
      { status: 500 },
    );
  }
}

/** Округлення до 2 знаків (як `Окр(..., 2)` у 1С). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
