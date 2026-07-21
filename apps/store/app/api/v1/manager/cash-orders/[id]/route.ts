import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma, prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canDeleteManagerDoc } from "@/lib/manager/doc-delete-permission";
import { getMyClientCodes1C } from "@/lib/manager/sale-ownership";
import {
  recomputeDebtForClients,
  resolveClientIdByCustomer,
} from "@/lib/manager/debt-register";
import { deleteCashFlowMovementsForOrder } from "@/lib/manager/cashflow-register";
import {
  createPaymentOrders,
  updateCashOrderDraft,
} from "@/lib/manager/cash-order";
import {
  cashOrderDraftSchema,
  processPaymentSchema,
} from "@/lib/validations/manager-cash-order";

type ManagerUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * Ownership-гард касового ордера: manager — лише свої клієнти (через code1C
 * платника — Контрагент ордера АБО клієнт його реалізації); admin — будь-який.
 * Повертає `true` якщо видно.
 */
async function canAccessCashOrder(
  user: ManagerUser,
  existing: {
    customer: { code1C: string | null } | null;
    sale: { customerId: string } | null;
  },
): Promise<boolean> {
  const myCodes = await getMyClientCodes1C(user);
  if (myCodes === null) return true; // admin
  let code1C = existing.customer?.code1C ?? null;
  if (!code1C && existing.sale?.customerId) {
    const saleCustomer = await prisma.customer.findUnique({
      where: { id: existing.sale.customerId },
      select: { code1C: true },
    });
    code1C = saleCustomer?.code1C ?? null;
  }
  return !!code1C && myCodes.includes(code1C);
}

/**
 * PATCH касового ордера. Дві гілки:
 *  • `draft:true` — автозбереження чернетки: послаблена схема, оновлення БЕЗ
 *    ефектів проведення (`updateCashOrderDraft`);
 *  • інакше — явне «Зберегти/Провести» з форми: перевикористовує цей рядок як
 *    прихідний ордер (`createPaymentOrders({ reuseIncomeId })`), тож autosave не
 *    дублює документ. Обидві гілки заборонені для вже проведеного (`posted`).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.mgrCashOrder.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      // Підстава (реалізація/клієнт) — щоб autosave-оновлення чернетки її НЕ
      // губило (draftBody з форми не несе saleId/customerId).
      saleId: true,
      customerId: true,
      customer: { select: { code1C: true } },
      sale: { select: { customerId: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Оплату не знайдено" }, { status: 404 });
  }
  if (!(await canAccessCashOrder(user, existing))) {
    return NextResponse.json({ error: "Оплату не знайдено" }, { status: 404 });
  }

  // Проведений ордер заблокований для будь-яких змін (рухи ДДС/боргу вже є).
  if (existing.status === "posted") {
    return NextResponse.json(
      { error: "Оплату проведено — редагування заборонено" },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => null);

  // ─── Автозбереження чернетки (draft) ──────────────────────────────────────
  if (body && typeof body === "object" && (body as { draft?: unknown }).draft) {
    const parsedDraft = cashOrderDraftSchema.safeParse(body);
    if (!parsedDraft.success) {
      return NextResponse.json(
        {
          error: "Невірні дані",
          details: parsedDraft.error.issues.slice(0, 5),
        },
        { status: 400 },
      );
    }
    const input = parsedDraft.data;
    try {
      const draft = await updateCashOrderDraft(id, {
        // Зберігаємо підставу з наявного рядка (draftBody її не передає) — інакше
        // повний replace обнулив би saleId/customerId, і проведення втратило б
        // зв'язок з реалізацією.
        saleId: existing.saleId,
        customerId: existing.customerId,
        type: input.type ?? "income",
        paid: {
          uah: input.amountUah ?? 0,
          eur: input.amountEur ?? 0,
          usd: input.amountUsd ?? 0,
          uahCashless: input.amountUahCashless ?? 0,
        },
        bankAccountId: input.bankAccountId ?? null,
        cashFlowArticleId: input.cashFlowArticleId ?? null,
        comment: input.comment ?? null,
        rates: { eur: input.rateEur ?? 0, usd: input.rateUsd ?? 0 },
      });
      return NextResponse.json({ id: draft.id, status: draft.status });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2003" || err.code === "P2025") {
          return NextResponse.json(
            { error: "Невалідні дані оплати" },
            { status: 400 },
          );
        }
      }
      console.error("[L-TEX] Cash order draft update failed", {
        cashOrderId: id,
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: "Помилка збереження чернетки" },
        { status: 500 },
      );
    }
  }

  // ─── Явне збереження/проведення (перевикористання чернетки як ордера) ──────
  const parsed = processPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Невірні дані", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Гард прихованого рахунку при приході (як у POST).
  if (input.type === "income" && input.bankAccountId) {
    const acct = await prisma.mgrBankAccount.findUnique({
      where: { id: input.bankAccountId },
      select: { hiddenInApp: true },
    });
    if (acct?.hiddenInApp) {
      return NextResponse.json(
        { error: "Цей рахунок не можна вибирати при приході" },
        { status: 400 },
      );
    }
  }

  // Резолв платника з наявного ордера (клієнт/реалізація не змінюються при PATCH).
  const current = await prisma.mgrCashOrder.findUnique({
    where: { id },
    select: { saleId: true, customerId: true },
  });

  try {
    const { income, change } = await createPaymentOrders({
      reuseIncomeId: id,
      saleId: current?.saleId ?? null,
      customerId: current?.customerId ?? null,
      type: input.type,
      paid: {
        uah: input.amountUah,
        eur: input.amountEur,
        usd: input.amountUsd,
        uahCashless: input.amountUahCashless,
      },
      change: {
        uah: input.changeUah,
        eur: input.changeEur,
        usd: input.changeUsd,
      },
      bankAccountId: input.bankAccountId ?? null,
      cashFlowArticleId: input.cashFlowArticleId ?? null,
      comment: input.comment ?? null,
      post: input.post,
      rates: { eur: input.rateEur, usd: input.rateUsd },
      sumToPayEur: input.sumToPayEur,
      agentUserId: user.id,
    });
    revalidatePath("/manager/payments");
    return NextResponse.json({ income, change });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2003" || err.code === "P2025") {
        return NextResponse.json(
          { error: "Невалідні дані оплати" },
          { status: 400 },
        );
      }
    }
    console.error("[L-TEX] Cash order update failed", {
      cashOrderId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка оновлення оплати" },
      { status: 500 },
    );
  }
}

/**
 * Видалення касового ордера / оплати (з контекстного меню списку Оплати).
 *
 * Ownership: admin — будь-який ордер; manager — лише ордери своїх клієнтів
 * (через `Customer.code1C` платника, як у POST `/cash-orders`). Standalone-ордер
 * без платника (`customerId`/`saleId` обидва null) видаляє лише admin/owner.
 *
 * Реверс сліду документа в одній транзакції:
 *   - рух боргу проведеної оплати (`kind="payment"`, `sourceType="cash_order"`,
 *     `sourceId=cashOrderId`) видаляється → далі `MgrClient.debt` перераховується;
 *   - парний ордер-здача (`changeForId === id`) видаляється разом (інакше
 *     лишився б «висячий» розхід);
 *   - `MgrCashOrder.routeSheetId` — плоский скаляр (не FK), реальні документи МЛ
 *     не зачіпаємо.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: "Не авторизовано" }, { status: 401 });
  }

  if (!canDeleteManagerDoc(user.role)) {
    return NextResponse.json(
      { error: "Недостатньо прав для видалення" },
      { status: 403 },
    );
  }

  const { id } = await params;

  const existing = await prisma.mgrCashOrder.findUnique({
    where: { id },
    select: {
      id: true,
      customerId: true,
      sale: { select: { customerId: true } },
      customer: { select: { code1C: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Оплату не знайдено" }, { status: 404 });
  }

  // Ownership: manager — лише свої клієнти. Резолвимо code1C платника
  // (Контрагент ордера або клієнт його реалізації).
  const myCodes = await getMyClientCodes1C(user);
  if (myCodes !== null) {
    let code1C = existing.customer?.code1C ?? null;
    if (!code1C && existing.sale?.customerId) {
      const saleCustomer = await prisma.customer.findUnique({
        where: { id: existing.sale.customerId },
        select: { code1C: true },
      });
      code1C = saleCustomer?.code1C ?? null;
    }
    if (!code1C || !myCodes.includes(code1C)) {
      return NextResponse.json(
        { error: "Оплату не знайдено" },
        { status: 404 },
      );
    }
  }

  // Клієнт для перерахунку боргу: платник ордера (customerId) або клієнт реалізації.
  const effectiveCustomerId =
    existing.customerId ?? existing.sale?.customerId ?? null;

  try {
    const debtMovements = await prisma.mgrDebtMovement.findMany({
      where: { sourceType: "cash_order", sourceId: id },
      select: { clientId: true },
    });
    const affectedClientIds = new Set(debtMovements.map((m) => m.clientId));

    // Парні ордери-здачі (розхід) цього приходу — потрібні їхні id, щоб прибрати
    // їхні рухи ДДС (реєстратор `local:<changeId>`).
    const changeOrders = await prisma.mgrCashOrder.findMany({
      where: { changeForId: id },
      select: { id: true },
    });

    await prisma.$transaction(async (tx) => {
      // Спочатку прибираємо рух боргу цього ордера.
      await tx.mgrDebtMovement.deleteMany({
        where: { sourceType: "cash_order", sourceId: id },
      });
      // Рухи ДДС основного ордера + усіх його ордерів-здач.
      await deleteCashFlowMovementsForOrder(tx, [
        id,
        ...changeOrders.map((o) => o.id),
      ]);
      // Парний ордер-здача (розхід) посилається на цей прихід через changeForId —
      // видаляємо його теж, інакше лишиться «висячий» розхід.
      await tx.mgrCashOrder.deleteMany({ where: { changeForId: id } });
      await tx.mgrCashOrder.delete({ where: { id } });
    });

    // Резерв: якщо рухів не було, все одно перерахуємо клієнта-платника.
    if (affectedClientIds.size === 0 && effectiveCustomerId) {
      const clientId = await resolveClientIdByCustomer(
        prisma,
        effectiveCustomerId,
      );
      if (clientId) affectedClientIds.add(clientId);
    }
    if (affectedClientIds.size > 0) {
      await recomputeDebtForClients(prisma, [...affectedClientIds]);
    }

    revalidatePath("/manager/payments");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[L-TEX] Cash order delete failed", {
      cashOrderId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Помилка видалення оплати" },
      { status: 500 },
    );
  }
}
