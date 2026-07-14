import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canViewSale } from "@/lib/manager/sale-ownership";
import { computeCashSummary } from "@/lib/manager/cash-order";

/**
 * Блок «Реалізація» — Етап 4. Список касових ордерів по реалізації + зведення
 * (сума до оплати / отримано / залишок).
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

  const ok = await canViewSale(user, id);
  if (!ok) {
    return NextResponse.json(
      { error: "Реалізацію не знайдено" },
      { status: 404 },
    );
  }

  const sale = await prisma.sale.findUnique({
    where: { id },
    select: {
      id: true,
      totalEur: true,
      exchangeRateEur: true,
      exchangeRateUsd: true,
      cashOnDelivery: true,
      codAmountUah: true,
    },
  });
  if (!sale) {
    return NextResponse.json(
      { error: "Реалізацію не знайдено" },
      { status: 404 },
    );
  }

  const orders = await prisma.mgrCashOrder.findMany({
    where: { saleId: id },
    orderBy: { createdAt: "asc" },
  });

  // Зведення (отримано/залишок) рахуємо ЛИШЕ за проведеними ордерами; чернетки
  // показуємо у списку, але фінансово вони ще не впливають.
  const postedOrders = orders.filter((o) => o.status === "posted");
  const dueUah = Math.round(sale.totalEur * sale.exchangeRateEur);
  const summary = computeCashSummary({
    dueUah,
    orders: postedOrders,
    rates: { eur: sale.exchangeRateEur, usd: sale.exchangeRateUsd },
  });

  return NextResponse.json({
    dueUah,
    cashOnDelivery: sale.cashOnDelivery,
    codAmountUah: sale.codAmountUah,
    exchangeRateEur: sale.exchangeRateEur,
    exchangeRateUsd: sale.exchangeRateUsd,
    summary,
    orders: orders.map((o) => ({
      id: o.id,
      type: o.type,
      status: o.status,
      amountUah: o.amountUah,
      amountEur: o.amountEur,
      amountUsd: o.amountUsd,
      amountUahCashless: o.amountUahCashless,
      changeCurrency: o.changeCurrency,
      changeForId: o.changeForId,
      bankAccount: o.bankAccount,
      cashFlowArticle: o.cashFlowArticle,
      comment: o.comment,
      paidAt: o.paidAt.toISOString(),
      createdAt: o.createdAt.toISOString(),
    })),
  });
}
