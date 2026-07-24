import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";

/** Скільки днів чекаємо оплату після «Скинути реквізити». */
const EXPECTATION_TTL_DAYS = 14;

const createSchema = z.object({
  /** Customer.id (форма реалізації працює з Customer). */
  customerId: z.string().min(1),
  saleId: z.string().min(1).optional(),
  amountUah: z.number().positive().max(100_000_000),
  /** MgrBankAccount.id набору реквізитів. */
  bankAccountId: z.string().min(1).optional(),
});

/**
 * POST /api/v1/manager/payment-expectations — «очікування оплати» (Крок 3
 * воронки). Пишеться fire-and-forget, коли менеджер тисне «Скинути реквізити»
 * на суму X для клієнта Y: точний збіг суми вхідної транзакції у вікні TTL —
 * сильний сигнал авто-рознесення. Доступ — будь-який авторизований користувач
 * менеджерки (реквізити скидають менеджери).
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некоректні дані" }, { status: 400 });
  }
  const { customerId, saleId, amountUah, bankAccountId } = parsed.data;

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true },
  });
  if (!customer) {
    return NextResponse.json({ error: "Клієнта не знайдено" }, { status: 404 });
  }

  const expiresAt = new Date(
    Date.now() + EXPECTATION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  // Антидубль: те саме відкрите очікування (клієнт+сума) лише продовжуємо.
  const existing = await prisma.paymentExpectation.findFirst({
    where: { customerId, status: "open", amountUah },
    select: { id: true },
  });
  if (existing) {
    await prisma.paymentExpectation.update({
      where: { id: existing.id },
      data: { expiresAt, saleId: saleId ?? undefined },
    });
    return NextResponse.json({ ok: true, id: existing.id, refreshed: true });
  }

  const created = await prisma.paymentExpectation.create({
    data: {
      customerId,
      customerName: customer.name,
      saleId: saleId ?? null,
      amountUah,
      bankAccountId: bankAccountId ?? null,
      createdByUserId: user.id,
      expiresAt,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: created.id });
}
