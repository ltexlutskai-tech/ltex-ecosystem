import { NextRequest, NextResponse } from "next/server";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getMyClientCodes1C } from "@/lib/manager/order-ownership";
import { enqueuePaymentCreate } from "@/lib/sync/enqueue";
import { createPaymentSchema } from "@/lib/validations/manager-payment";

/**
 * POST /api/v1/manager/payments — створює Payment record на існуючий Order.
 *
 * Ownership: через `Order.customer.code1C` → manager бачить тільки свої.
 *
 * Status default `"completed"` — менеджер створює factual payment record;
 * 1С підтвердить чи rejectне через sync. Refund/cancel — поза scope.
 *
 * Після успіху — fire-and-forget enqueue до 1С (best-effort).
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { customer: { select: { code1C: true } } },
  });
  if (!order) {
    return NextResponse.json(
      { error: "Замовлення не знайдено" },
      { status: 404 },
    );
  }

  const myCodes = await getMyClientCodes1C(user);
  if (myCodes !== null) {
    if (!order.customer.code1C || !myCodes.includes(order.customer.code1C)) {
      return NextResponse.json({ error: "Не ваш клієнт" }, { status: 403 });
    }
  }

  let payment;
  try {
    payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        method: input.method,
        amount: input.amount,
        currency: input.currency,
        status: "completed",
        externalId: input.externalId,
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2003" || err.code === "P2025") {
        return NextResponse.json(
          { error: "Невалідний orderId" },
          { status: 400 },
        );
      }
    }
    console.error("[L-TEX] Payment create failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка створення оплати" },
      { status: 500 },
    );
  }

  enqueuePaymentCreate({
    id: payment.id,
    orderId: payment.orderId,
    method: payment.method,
    amount: payment.amount,
    currency: payment.currency,
    externalId: payment.externalId,
    paidAt: payment.paidAt,
    order: { code1C: order.code1C },
  }).catch((e: unknown) => {
    console.warn("[L-TEX] Failed to enqueue payment sync", {
      paymentId: payment.id,
      error: e instanceof Error ? e.message : String(e),
    });
  });

  return NextResponse.json(
    {
      id: payment.id,
      orderId: payment.orderId,
      method: payment.method,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      externalId: payment.externalId,
      paidAt: payment.paidAt?.toISOString() ?? null,
      createdAt: payment.createdAt.toISOString(),
    },
    { status: 201 },
  );
}
