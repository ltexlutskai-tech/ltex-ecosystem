import { Prisma, prisma } from "@ltex/db";

/**
 * Картка клієнта — Фаза 4: авто-записи історії взаємодій (`MgrClientTimelineEntry`).
 *
 * Відтворює 1С-реєстр `РаботаСКлиентом`: при НАШИХ локальних подіях
 * (замовлення / реалізація / оплата / бронь / нагадування) пишемо timeline-запис
 * з 1С-подібним заголовком. Тип події кодується через `kind`:
 *
 *   order | sale | payment | bron | reminder  — авто-записи (read-only в UI);
 *   comment                                    — ручний запис менеджера (редагований).
 *
 * **Fire-and-forget & safe:** запис історії НЕ повинен ламати основну операцію
 * (створення замовлення/реалізації/оплати/броні/нагадування). Тому виклики йдуть
 * через `recordClientEventSafe`, що ловить будь-яку помилку (включно з
 * prisma-mock без `mgrClient`/`mgrClientTimelineEntry` у тестах) і ковтає її.
 * Дзеркалить best-effort enqueue-патерн з `order-create.ts`.
 *
 * БЕЗ нової міграції — використовуємо наявну `MgrClientTimelineEntry`.
 */

/** Тип події історії (kind у `MgrClientTimelineEntry`). */
export type ClientEventKind =
  | "order"
  | "sale"
  | "payment"
  | "bron"
  | "reminder"
  | "comment";

export interface RecordClientEventArgs {
  /** MgrClient.id — прямий шлях (напр. бронь, нагадування). */
  clientId?: string | null;
  /**
   * Customer.id — резолвимо у MgrClient за спільним `code1C`
   * (замовлення/реалізація/оплата зберігають Customer, не MgrClient).
   */
  customerId?: string | null;
  kind: ClientEventKind;
  /** Текст запису (1С-подібний заголовок + факти). */
  body: string;
  /** Автор події (поточний менеджер); null для системних. */
  authorUserId?: string | null;
  /** Довільні структуровані дані (id документа, суми тощо). */
  metadata?: Prisma.InputJsonValue;
  /** Момент події (дефолт — зараз). */
  occurredAt?: Date;
}

/**
 * Резолвить MgrClient.id з args: пряме `clientId`, інакше через `customerId`
 * (Customer.code1C → MgrClient.code1C). Повертає null, якщо жоден клієнт не
 * знайдено (напр. Customer без code1C, або немає дзеркала у MgrClient).
 */
async function resolveMgrClientId(
  args: Pick<RecordClientEventArgs, "clientId" | "customerId">,
): Promise<string | null> {
  if (args.clientId) {
    const mgr = await prisma.mgrClient.findUnique({
      where: { id: args.clientId },
      select: { id: true },
    });
    return mgr?.id ?? null;
  }

  if (args.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: args.customerId },
      select: { code1C: true },
    });
    if (!customer?.code1C) return null;
    const mgr = await prisma.mgrClient.findUnique({
      where: { code1C: customer.code1C },
      select: { id: true },
    });
    return mgr?.id ?? null;
  }

  return null;
}

/**
 * Створює timeline-запис історії для клієнта. Резолвить MgrClient.id (за
 * `clientId` АБО `customerId`→code1C), потім `mgrClientTimelineEntry.create`.
 * Якщо MgrClient не резолвиться — тихо пропускає (return false).
 *
 * **НЕ безпечний сам по собі** — кидає, якщо БД недоступна. Для виклику з
 * create-ендпоінтів використовуй `recordClientEventSafe`.
 */
export async function recordClientEvent(
  args: RecordClientEventArgs,
): Promise<boolean> {
  const mgrClientId = await resolveMgrClientId(args);
  if (!mgrClientId) return false;

  await prisma.mgrClientTimelineEntry.create({
    data: {
      clientId: mgrClientId,
      kind: args.kind,
      body: args.body,
      occurredAt: args.occurredAt ?? new Date(),
      authorUserId: args.authorUserId ?? null,
      ...(args.metadata !== undefined ? { metadata: args.metadata } : {}),
    },
  });
  return true;
}

/**
 * Fire-and-forget обгортка над `recordClientEvent` — НІКОЛИ не кидає й не
 * блокує відповідь. Викликати БЕЗ await на success-точці create-ендпоінта.
 * Будь-яка помилка (включно з prisma-mock без потрібних моделей) ковтається.
 */
export function recordClientEventSafe(args: RecordClientEventArgs): void {
  try {
    void recordClientEvent(args).catch((e: unknown) => {
      console.warn("[L-TEX] Failed to record client timeline event", {
        kind: args.kind,
        error: e instanceof Error ? e.message : String(e),
      });
    });
  } catch (e: unknown) {
    console.warn("[L-TEX] Failed to record client timeline event (sync)", {
      kind: args.kind,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

// ─── Білдери тексту запису (1С-подібні заголовки, короткі й фактичні) ─────────

/** Грн без копійок, з пробілами (1 234 грн). */
function formatUah(amount: number): string {
  return `${Math.round(amount).toLocaleString("uk-UA")} грн`;
}

/** Дата у форматі ДД.ММ.РРРР. */
function formatDateUkr(d: Date): string {
  return d.toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** `Замовлення на 1 234 грн (3 позицій)` */
export function buildOrderEventBody(
  totalUah: number,
  itemCount: number,
): string {
  return `Замовлення на ${formatUah(totalUah)} (${itemCount} позицій)`;
}

/** `Реалізація на 1 234 грн (3 позицій)` */
export function buildSaleEventBody(
  totalUah: number,
  itemCount: number,
): string {
  return `Реалізація на ${formatUah(totalUah)} (${itemCount} позицій)`;
}

/** `Оплата: 1 234 грн` (або в EUR/USD коли грн = 0). */
export function buildPaymentEventBody(args: {
  amountUah: number;
  amountEur: number;
  amountUsd: number;
  type: string;
}): string {
  const head = args.type === "expense" ? "Розхід" : "Оплата";
  const parts: string[] = [];
  if (args.amountUah > 0)
    parts.push(`${Math.round(args.amountUah).toLocaleString("uk-UA")} грн`);
  if (args.amountEur > 0) parts.push(`${args.amountEur.toFixed(2)} €`);
  if (args.amountUsd > 0) parts.push(`${args.amountUsd.toFixed(2)} $`);
  const sum = parts.length > 0 ? parts.join(" + ") : "0 грн";
  return `${head}: ${sum}`;
}

/** `Встановлення броні: 1234567890123 до 02.06.2026` */
export function buildBronEventBody(barcode: string, until: Date): string {
  return `Встановлення броні: ${barcode} до ${formatDateUkr(until)}`;
}

/** `Нагадування: <перші ~80 символів тексту>` */
export function buildReminderEventBody(text: string): string {
  const trimmed = text.trim();
  const short = trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
  return `Нагадування: ${short}`;
}
