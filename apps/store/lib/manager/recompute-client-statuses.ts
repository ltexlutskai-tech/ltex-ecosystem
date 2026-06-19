/**
 * Авто-перерахунок статусів контрагентів (порт 1С `МодульРегламентныхЗаданий.
 * ИзменениеСтатусовКонтрагентов`, рядки 276-500).
 *
 * Дві осі статусу на `MgrClient`:
 *   • statusGeneral     — за ПОПЕРЕДНІЙ повний календарний місяць;
 *   • statusOperational — за ПОТОЧНИЙ календарний місяць.
 *
 * Правило (для кожної осі):
 *   ≥2 різних продажі  → «Активний»
 *   ==1 продаж         → «Малоактивний»
 *   ==0 продаж         → «Неактивний» (АЛЕ якщо поточний статус «Потенційний» —
 *                        не перебиваємо на «Неактивний», як у BSL).
 *
 * «Різні продажі» = distinct документи `Sale` (1С рахує distinct Регистратор у
 * РегистрНакопления.Продажи.Обороты). Не-скасовані реалізації клієнта у періоді.
 *
 * Нові клієнти (`createdAt` < 30 днів) у статусі «Новий» → обидві осі стають
 * «Потенційний».
 *
 * Кожна зміна → запис у `ClientStatusHistory` (idempotent по
 * (clientCode1C, changedAt=початок дня)).
 *
 * Чиста функція `classifyStatus` винесена для тестів; раннер `recomputeClientStatuses`
 * читає `Sale` через Prisma.
 */

import { prisma } from "@ltex/db";

import { CLIENT_STATUS_SEED, type SeedStatus } from "./client-status-codes";

export type { SeedStatus };
export { CLIENT_STATUS_SEED };

// ─── Коди статусів (з 1С Predefined.xml) ──────────────────────────────────────
export const STATUS_CODE_ACTIVE = "000000001";
export const STATUS_CODE_INACTIVE = "000000002";
export const STATUS_CODE_NEW = "000000003";
export const STATUS_CODE_LOW_ACTIVITY = "000000004";
export const STATUS_CODE_POTENTIAL = "000000007";

const NEW_CLIENT_WINDOW_DAYS = 30;

export type StatusBucket = "active" | "low" | "inactive" | "potential";

/**
 * Класифікація осі статусу за кількістю продажів у періоді.
 *
 * @param salesCount        кількість distinct продажів у періоді
 * @param isNew             клієнт молодший 30 днів і поточний статус «Новий»
 * @param currentIsPotential поточний статус осі = «Потенційний»
 * @returns цільовий стан осі, або `null` якщо змінювати не треба
 */
export function classifyStatus(
  salesCount: number,
  isNew: boolean,
  currentIsPotential: boolean,
): StatusBucket | null {
  // Нові клієнти у статусі «Новий» → «Потенційний» (обидві осі).
  if (isNew) return "potential";

  if (salesCount >= 2) return "active";
  if (salesCount === 1) return "low";
  // salesCount === 0
  // 1С: не перебиваємо «Потенційний» на «Неактивний».
  if (currentIsPotential) return null;
  return "inactive";
}

function bucketToCode(bucket: StatusBucket): string {
  switch (bucket) {
    case "active":
      return STATUS_CODE_ACTIVE;
    case "low":
      return STATUS_CODE_LOW_ACTIVITY;
    case "inactive":
      return STATUS_CODE_INACTIVE;
    case "potential":
      return STATUS_CODE_POTENTIAL;
  }
}

// ─── Допоміжні дати (UTC-safe межі місяця) ────────────────────────────────────

/** Початок поточного календарного місяця (UTC). */
export function startOfMonthUTC(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Початок наступного календарного місяця (UTC) — ексклюзивна верхня межа. */
export function startOfNextMonthUTC(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** Початок попереднього календарного місяця (UTC). */
export function startOfPrevMonthUTC(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
}

/** Початок дня (UTC) — ключ запису історії. */
export function startOfDayUTC(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

interface PeriodRange {
  /** включно */ start: Date;
  /** виключно */ end: Date;
}

/** Поточний місяць [start, end). */
export function currentMonthRange(now: Date): PeriodRange {
  return { start: startOfMonthUTC(now), end: startOfNextMonthUTC(now) };
}

/** Попередній місяць [start, end). */
export function prevMonthRange(now: Date): PeriodRange {
  return { start: startOfPrevMonthUTC(now), end: startOfMonthUTC(now) };
}

export interface RecomputeResult {
  /** клієнтів оброблено */ processed: number;
  /** статусів statusGeneral змінено */ generalChanged: number;
  /** статусів statusOperational змінено */ operationalChanged: number;
  /** клієнтів переведено у «Потенційний» (нові) */ newToPotential: number;
  /** записів історії додано */ historyWritten: number;
}

interface RunnerOptions {
  /** override «зараз» для тестів */ now?: Date;
  /** скільки клієнтів обробляти за батч */ batchSize?: number;
}

/**
 * Раннер: перебирає всіх клієнтів з `code1C`, рахує продажі за два періоди,
 * оновлює статуси + пише історію. Idempotent (повторний запуск у той самий день
 * не дублює історію завдяки unique-ключу).
 */
export async function recomputeClientStatuses(
  options: RunnerOptions = {},
): Promise<RecomputeResult> {
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? 500;

  const statuses = await prisma.mgrClientStatus.findMany({
    select: { id: true, code: true },
  });
  const idByCode = new Map(statuses.map((s) => [s.code, s.id]));
  const codeById = new Map(statuses.map((s) => [s.id, s.code]));

  // Якщо довідник не засіяний — нічого не робимо (потрібен seed).
  if (idByCode.size === 0) {
    return {
      processed: 0,
      generalChanged: 0,
      operationalChanged: 0,
      newToPotential: 0,
      historyWritten: 0,
    };
  }

  const prev = prevMonthRange(now);
  const curr = currentMonthRange(now);
  const newClientThreshold = new Date(
    now.getTime() - NEW_CLIENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const historyDay = startOfDayUTC(now);

  const result: RecomputeResult = {
    processed: 0,
    generalChanged: 0,
    operationalChanged: 0,
    newToPotential: 0,
    historyWritten: 0,
  };

  let cursor: string | undefined;
  for (;;) {
    const clients = await prisma.mgrClient.findMany({
      where: { code1C: { not: null } },
      select: {
        id: true,
        code1C: true,
        createdAt: true,
        statusGeneralId: true,
        statusOperationalId: true,
        // зв'язка MgrClient.code1C === Customer.code1C для пошуку Sale
      },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (clients.length === 0) break;
    cursor = clients[clients.length - 1]!.id;

    for (const client of clients) {
      result.processed += 1;
      const code1C = client.code1C!;

      const currentGeneralCode = client.statusGeneralId
        ? (codeById.get(client.statusGeneralId) ?? null)
        : null;
      const currentOperationalCode = client.statusOperationalId
        ? (codeById.get(client.statusOperationalId) ?? null)
        : null;

      const isNew =
        client.createdAt >= newClientThreshold &&
        (currentGeneralCode === STATUS_CODE_NEW ||
          currentOperationalCode === STATUS_CODE_NEW);

      // Кількість distinct продажів (документів Sale) за два періоди.
      // Зв'язка: Sale.customer.code1C === MgrClient.code1C.
      const [prevCount, currCount] = await Promise.all([
        prisma.sale.count({
          where: {
            customer: { code1C: code1C },
            status: { not: "cancelled" },
            createdAt: { gte: prev.start, lt: prev.end },
          },
        }),
        prisma.sale.count({
          where: {
            customer: { code1C: code1C },
            status: { not: "cancelled" },
            createdAt: { gte: curr.start, lt: curr.end },
          },
        }),
      ]);

      const generalBucket = classifyStatus(
        prevCount,
        isNew,
        currentGeneralCode === STATUS_CODE_POTENTIAL,
      );
      const operationalBucket = classifyStatus(
        currCount,
        isNew,
        currentOperationalCode === STATUS_CODE_POTENTIAL,
      );

      const targetGeneralCode = generalBucket
        ? bucketToCode(generalBucket)
        : currentGeneralCode;
      const targetOperationalCode = operationalBucket
        ? bucketToCode(operationalBucket)
        : currentOperationalCode;

      const generalChanged =
        targetGeneralCode != null && targetGeneralCode !== currentGeneralCode;
      const operationalChanged =
        targetOperationalCode != null &&
        targetOperationalCode !== currentOperationalCode;

      if (!generalChanged && !operationalChanged) continue;

      const data: {
        statusGeneralId?: string;
        statusOperationalId?: string;
      } = {};
      if (generalChanged) {
        const id = idByCode.get(targetGeneralCode!);
        if (id) data.statusGeneralId = id;
      }
      if (operationalChanged) {
        const id = idByCode.get(targetOperationalCode!);
        if (id) data.statusOperationalId = id;
      }
      if (Object.keys(data).length === 0) continue;

      if (
        isNew &&
        (generalBucket === "potential" || operationalBucket === "potential")
      ) {
        result.newToPotential += 1;
      }
      if (data.statusGeneralId) result.generalChanged += 1;
      if (data.statusOperationalId) result.operationalChanged += 1;

      await prisma.mgrClient.update({
        where: { id: client.id },
        data,
      });

      // Історія — idempotent по (clientCode1C, changedAt=початок дня).
      const finalGeneralCode = data.statusGeneralId
        ? targetGeneralCode
        : currentGeneralCode;
      const finalOperationalCode = data.statusOperationalId
        ? targetOperationalCode
        : currentOperationalCode;
      try {
        await prisma.clientStatusHistory.upsert({
          where: {
            client_status_history_key: {
              clientCode1C: code1C,
              changedAt: historyDay,
            },
          },
          create: {
            clientCode1C: code1C,
            statusCode1C: finalGeneralCode,
            operationalStatus: finalOperationalCode,
            changedAt: historyDay,
          },
          update: {
            statusCode1C: finalGeneralCode,
            operationalStatus: finalOperationalCode,
          },
        });
        result.historyWritten += 1;
      } catch {
        // не валимо весь прогін через один запис історії
      }
    }
  }

  return result;
}
