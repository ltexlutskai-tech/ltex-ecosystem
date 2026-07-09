import { prisma } from "@ltex/db";
import { getCurrentRate } from "@/lib/exchange-rate";

/**
 * Блок «Маршрут», доробка Б — витрати маршруту (пробіг → рух грошей).
 *
 * У центральній 1С маршрутний лист рахував пробіг (ОдометрКонец−ОдометрНачало),
 * множив на ЦінаЗаКМ і писав витрату у грошові регістри зі статтею витрат. У нас
 * поля кілометражу були, але ні на що не перетворювались. Цей модуль:
 *   • обчислює пробіг і суму авто-витрати «Пальне/пробіг»;
 *   • тримає авто-рядок витрат у синхроні з кілометражем (isMileage=true);
 *   • при проведенні (completed) пише рух каси (`CashFlowMovement`, розхід) на
 *     кожен рядок витрат — best-effort, дзеркалить `applyCashFlowMovementSafe`.
 *
 * Idempotent-ключ руху каси витрати: recorderCode1C = `rsexp:${expense.id}`,
 * lineNo=1 (кожна витрата — власний стабільний ключ; додавання/видалення чисте).
 */

/** Назва авто-рядка витрат на пробіг. */
export const MILEAGE_EXPENSE_LABEL = "Пальне/пробіг";

/** Назви статей-кандидатів для авто-резолву статті пального. */
const FUEL_ARTICLE_PATTERNS = ["пальне", "пробіг", "пмм", "паливо", "бензин"];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * PURE. Пробіг = кінець − початок, якщо обидва задані й кінець ≥ початок.
 * Інакше 0 (некоректний/неповний кілометраж не рахуємо).
 */
export function computeMileage(
  startKm: number | null | undefined,
  endKm: number | null | undefined,
): number {
  if (startKm == null || endKm == null) return 0;
  if (endKm < startKm) return 0;
  return round2(endKm - startKm);
}

/**
 * PURE. Сума авто-витрати на пробіг = пробіг × ціна за км. 0, якщо ціни немає.
 */
export function computeMileageExpenseAmount(
  startKm: number | null | undefined,
  endKm: number | null | undefined,
  pricePerKm: number | null | undefined,
): number {
  if (pricePerKm == null || pricePerKm <= 0) return 0;
  return round2(computeMileage(startKm, endKm) * pricePerKm);
}

/** Best-effort пошук статті «пального» у довіднику (для авто-рядка пробігу). */
async function resolveFuelArticleId(): Promise<string | null> {
  const article = await prisma.mgrCashFlowArticle.findFirst({
    where: {
      archived: false,
      OR: FUEL_ARTICLE_PATTERNS.map((p) => ({
        name: { contains: p, mode: "insensitive" as const },
      })),
    },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  return article?.id ?? null;
}

/**
 * Перебудовує авто-рядок витрат «Пальне/пробіг» під поточний кілометраж і ціну
 * за км. Ручні рядки (isMileage=false) не чіпає. Викликається при збереженні
 * шапки МЛ (зміна кілометражу/ціни за км). Best-effort, не кидає.
 *
 *  - пробіг×ціна = 0 → видаляє авто-рядок (якщо був);
 *  - інакше upsert-ить єдиний авто-рядок з новою сумою (стаття — best-effort
 *    авто-резолв «пального», лише якщо у рядка ще не проставлена стаття).
 */
export async function rebuildMileageExpense(
  routeSheetId: string,
): Promise<void> {
  const sheet = await prisma.routeSheet.findUnique({
    where: { id: routeSheetId },
    select: { mileageStartKm: true, mileageEndKm: true, pricePerKm: true },
  });
  if (!sheet) return;

  const amount = computeMileageExpenseAmount(
    sheet.mileageStartKm,
    sheet.mileageEndKm,
    sheet.pricePerKm,
  );

  const existing = await prisma.routeSheetExpense.findFirst({
    where: { routeSheetId, isMileage: true },
    select: { id: true, cashFlowArticleId: true },
  });

  if (amount <= 0) {
    if (existing) {
      await prisma.routeSheetExpense.delete({ where: { id: existing.id } });
    }
    return;
  }

  if (existing) {
    await prisma.routeSheetExpense.update({
      where: { id: existing.id },
      data: {
        amount,
        articleName: MILEAGE_EXPENSE_LABEL,
        // Статтю авто-резолвимо лише якщо її ще нема (не перетираємо вибір user).
        cashFlowArticleId:
          existing.cashFlowArticleId ?? (await resolveFuelArticleId()),
      },
    });
  } else {
    await prisma.routeSheetExpense.create({
      data: {
        routeSheetId,
        isMileage: true,
        articleName: MILEAGE_EXPENSE_LABEL,
        cashFlowArticleId: await resolveFuelArticleId(),
        currency: "UAH",
        amount,
      },
    });
  }
}

/** Fire-and-forget обгортка над `rebuildMileageExpense` (не кидає). */
export function rebuildMileageExpenseSafe(routeSheetId: string): void {
  void rebuildMileageExpense(routeSheetId).catch((e: unknown) => {
    console.warn("[L-TEX] Failed to rebuild mileage expense", {
      routeSheetId,
      error: e instanceof Error ? e.message : String(e),
    });
  });
}

/**
 * При проведенні МЛ (completed) пише рух каси (розхід) на кожен рядок витрат.
 * Best-effort ПІСЛЯ коміту. Ідемпотентно за recorderCode1C=`rsexp:${id}` lineNo=1.
 * Пропускає імпортовані з 1С МЛ (мають code1C — рухи вже з імпорту).
 */
export function applyRouteSheetExpensesSafe(routeSheetId: string): void {
  void (async () => {
    const sheet = await prisma.routeSheet.findUnique({
      where: { id: routeSheetId },
      select: { id: true, code1C: true, date: true },
    });
    if (!sheet || sheet.code1C) return;

    const expenses = await prisma.routeSheetExpense.findMany({
      where: { routeSheetId },
      select: {
        id: true,
        amount: true,
        currency: true,
        cashFlowArticle: { select: { code1C: true } },
      },
    });
    if (expenses.length === 0) return;

    const rate = await getCurrentRate();
    const occurredAt = sheet.date ?? new Date();

    for (const exp of expenses) {
      if (exp.amount <= 0) continue;
      const isUah = (exp.currency ?? "UAH") === "UAH";
      const amountUah = isUah ? round2(exp.amount) : round2(exp.amount * rate);
      const amountUpr = isUah
        ? rate > 0
          ? round2(exp.amount / rate)
          : 0
        : round2(exp.amount);

      await prisma.cashFlowMovement.upsert({
        where: {
          cash_flow_movement_src: {
            recorderCode1C: `rsexp:${exp.id}`,
            lineNo: 1,
          },
        },
        create: {
          occurredAt,
          recorderCode1C: `rsexp:${exp.id}`,
          lineNo: 1,
          accountCode1C: null,
          articleCode1C: exp.cashFlowArticle?.code1C ?? null,
          direction: 1, // витрата = розхід каси
          clientCode1C: null,
          amountUah,
          amountUpr,
          currencyCode: exp.currency ?? "UAH",
        },
        update: {
          articleCode1C: exp.cashFlowArticle?.code1C ?? null,
          amountUah,
          amountUpr,
          currencyCode: exp.currency ?? "UAH",
        },
      });
    }
  })().catch((e: unknown) => {
    console.warn("[L-TEX] Failed to apply route sheet expense movements", {
      routeSheetId,
      error: e instanceof Error ? e.message : String(e),
    });
  });
}

/** Прибирає рух каси одного рядка витрат (при видаленні). Best-effort. */
export function removeExpenseMovementSafe(expenseId: string): void {
  void prisma.cashFlowMovement
    .deleteMany({ where: { recorderCode1C: `rsexp:${expenseId}` } })
    .catch((e: unknown) => {
      console.warn("[L-TEX] Failed to remove expense movement", {
        expenseId,
        error: e instanceof Error ? e.message : String(e),
      });
    });
}
