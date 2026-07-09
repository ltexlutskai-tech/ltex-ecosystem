import { Prisma, prisma, type PrismaClient } from "@ltex/db";

/**
 * Проведення документа «Зміна стану мішка» (← 1С ИзменениеСостоянияМешка,
 * ПередЗаписью + ОбработкаПроведения).
 *
 * При проведенні для КОЖНОГО рядка (= один Lot за barcode):
 *  - поля стану записуються прямо в лот (`isOpen/isTarget/videoUrl/бронь/…`);
 *  - пишеться знімок у журнал `LotStateHistory` (реєстратор = документ);
 *  - якщо на мішку ВПЕРШЕ з'явилось відео і він заброньований на агента+клієнта
 *    → створюється event-нагадування «скинути відео у Viber» цьому агенту
 *    (дзеркалить 1С ОчередьНапоминанийСДействием / ОтправкаСообщенияВайбер).
 *
 * Ідемпотентність історії — delete-then-write за `recorderDocId` у транзакції.
 * Реверс (`removeBagStateChange`) видаляє історію за реєстратором; стан лотів
 * НЕ відкочується (журнальна семантика — «остання відома правда»).
 */

// ─── Дата-хелпери (чисті) ────────────────────────────────────────────────────

/** Кінець дня дати (23:59:59.999 локально) — 1С «ПериодБрони = КонецДня». */
export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Початок сьогоднішнього дня (00:00:00.000 локально). */
export function startOfToday(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Чи дата документа раніша за початок сьогодні (гард «сьогоднішній документ»). */
export function isBeforeToday(date: Date, now: Date = new Date()): boolean {
  return date.getTime() < startOfToday(now).getTime();
}

// ─── Чисте ядро (без I/O) ────────────────────────────────────────────────────

/** Рядок документа з уже зарезолвленим лотом + денормалізованими іменами. */
export interface BagStateLineInput {
  lotId: string;
  barcode: string;
  productId: string | null;
  /** Стан ДО запису — для тригера «вперше з'явилось відео». */
  previousHadVideo: boolean;
  isOpen: boolean;
  hasVideo: boolean;
  isTarget: boolean;
  youtubeUrl: string | null;
  description: string | null;
  comment: string | null;
  onAir: boolean;
  onAirDelivery: boolean;
  reservedAgentUserId: string | null;
  reservedAgentName: string | null;
  reservedClientId: string | null;
  reservedClientName: string | null;
  reservedUntil: Date | null;
  sector: string | null;
}

export interface BagStateLotUpdate {
  lotId: string;
  /** Назва сектора (текст) — sectorId резолвиться в оркестраторі (find-or-create). */
  sectorName: string | null;
  data: Prisma.LotUpdateInput;
}

export interface BagStateVideoTrigger {
  lotId: string;
  productId: string | null;
  barcode: string;
  reservedAgentUserId: string;
  reservedClientId: string;
}

export interface BagStateApplyPlan {
  lotUpdates: BagStateLotUpdate[];
  historyRows: Prisma.LotStateHistoryCreateManyInput[];
  videoTriggers: BagStateVideoTrigger[];
}

export interface BuildBagStateApplyInput {
  recorderDocId: string;
  occurredAt: Date;
  changedByUserId: string | null;
  lines: BagStateLineInput[];
}

/**
 * Чистий core: з рядків документа будує (а) оновлення лотів, (б) рядки журналу
 * історії, (в) тригери відео-нагадувань. Жодного I/O — легко тестується.
 *
 * Семантика відео (як 1С): `videoUrl`/`videoDate` оновлюються ЛИШЕ коли рядок
 * позначено «Є відео» (не затираємо існуюче, якщо галочку не поставили). Бронь
 * (`reservedBy*`/`reservedFor*`) — денормалізована, як у booking; коли є клієнт
 * броні — статус лота стає `reserved`.
 */
export function buildBagStateApply(
  input: BuildBagStateApplyInput,
): BagStateApplyPlan {
  const lotUpdates: BagStateLotUpdate[] = [];
  const historyRows: Prisma.LotStateHistoryCreateManyInput[] = [];
  const videoTriggers: BagStateVideoTrigger[] = [];

  for (const line of input.lines) {
    const reservedUntil = line.reservedUntil
      ? endOfDay(line.reservedUntil)
      : null;

    const data: Prisma.LotUpdateInput = {
      isOpen: line.isOpen,
      isTarget: line.isTarget,
      description: line.description,
      comment: line.comment,
      onAir: line.onAir,
      onAirDelivery: line.onAirDelivery,
      sector: line.sector,
      reservedByUserId: line.reservedAgentUserId,
      reservedByName: line.reservedAgentName,
      reservedForClientId: line.reservedClientId,
      reservedForName: line.reservedClientName,
      reservedUntil,
    };
    // Відео пишемо лише коли «Є відео» позначено (не затираємо існуюче).
    if (line.hasVideo) {
      data.videoUrl = line.youtubeUrl;
      data.videoDate = input.occurredAt;
    }
    // Бронь на клієнта → статус «reserved» (дзеркалить booking).
    if (line.reservedClientId) {
      data.status = "reserved";
    }

    lotUpdates.push({ lotId: line.lotId, sectorName: line.sector, data });

    historyRows.push({
      lotId: line.lotId,
      barcode: line.barcode,
      productId: line.productId,
      recorderDocId: input.recorderDocId,
      occurredAt: input.occurredAt,
      changedByUserId: input.changedByUserId,
      isOpen: line.isOpen,
      hasVideo: line.hasVideo,
      isTarget: line.isTarget,
      youtubeUrl: line.youtubeUrl,
      description: line.description,
      comment: line.comment,
      onAir: line.onAir,
      onAirDelivery: line.onAirDelivery,
      reservedAgentUserId: line.reservedAgentUserId,
      reservedClientId: line.reservedClientId,
      reservedUntil,
      sector: line.sector,
    });

    // Тригер відео: вперше з'явилось + заброньовано на агента + клієнта.
    if (
      line.hasVideo &&
      !line.previousHadVideo &&
      line.reservedAgentUserId &&
      line.reservedClientId
    ) {
      videoTriggers.push({
        lotId: line.lotId,
        productId: line.productId,
        barcode: line.barcode,
        reservedAgentUserId: line.reservedAgentUserId,
        reservedClientId: line.reservedClientId,
      });
    }
  }

  return { lotUpdates, historyRows, videoTriggers };
}

// ─── Оркестрація (БД) ────────────────────────────────────────────────────────

/** Find-or-create сектора складу за назвою (стабільний ключ `code`). */
async function findOrCreateSector(
  tx: Prisma.TransactionClient,
  name: string,
): Promise<string> {
  const code = name.trim();
  const existing = await tx.warehouseSector.findFirst({
    where: { OR: [{ code }, { name: code }] },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.warehouseSector.create({
    data: { name: code, code },
    select: { id: true },
  });
  return created.id;
}

export interface BagStateApplyResult {
  itemsUpdated: number;
  videoRemindersCreated: number;
  missingBarcodes: string[];
}

/**
 * Проводить документ: записує стан у лоти + журнал історії + тригери відео.
 * Кидає `bag_state_not_found` / `bag_not_found:<ШК,…>` (виклик-код повертає
 * помилку й НЕ переводить документ у posted).
 */
export async function applyBagStateChange(
  docId: string,
  userId: string,
  db: PrismaClient = prisma,
): Promise<BagStateApplyResult> {
  const doc = await db.bagStateChange.findUnique({
    where: { id: docId },
    select: {
      id: true,
      docDate: true,
      items: {
        orderBy: { lineNo: "asc" },
        select: {
          id: true,
          barcode: true,
          isOpen: true,
          hasVideo: true,
          isTarget: true,
          youtubeUrl: true,
          description: true,
          comment: true,
          onAir: true,
          onAirDelivery: true,
          reservedAgentUserId: true,
          reservedClientId: true,
          reservedUntil: true,
          sector: true,
        },
      },
    },
  });
  if (!doc) throw new Error("bag_state_not_found");

  // 1. Резолв лотів за barcode (+ поточний videoUrl для previousHadVideo).
  const barcodes = [
    ...new Set(doc.items.map((i) => i.barcode).filter(Boolean)),
  ];
  const lots = barcodes.length
    ? await db.lot.findMany({
        where: { barcode: { in: barcodes } },
        select: { id: true, barcode: true, videoUrl: true, productId: true },
      })
    : [];
  const lotByBarcode = new Map(lots.map((l) => [l.barcode, l]));

  const missingBarcodes: string[] = [];
  for (const it of doc.items) {
    if (!lotByBarcode.has(it.barcode)) missingBarcodes.push(it.barcode);
  }
  if (missingBarcodes.length > 0) {
    throw new Error(`bag_not_found:${missingBarcodes.join(",")}`);
  }

  // 2. Денормалізація імен броні (агент → User.fullName, клієнт → MgrClient.name).
  const agentIds = [
    ...new Set(
      doc.items
        .map((i) => i.reservedAgentUserId)
        .filter((v): v is string => !!v),
    ),
  ];
  const clientIds = [
    ...new Set(
      doc.items.map((i) => i.reservedClientId).filter((v): v is string => !!v),
    ),
  ];
  const [agents, clients] = await Promise.all([
    agentIds.length
      ? db.user.findMany({
          where: { id: { in: agentIds } },
          select: { id: true, fullName: true },
        })
      : Promise.resolve([]),
    clientIds.length
      ? db.mgrClient.findMany({
          where: { id: { in: clientIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const agentName = new Map(agents.map((a) => [a.id, a.fullName]));
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  // 3. План (чистий core).
  const lines: BagStateLineInput[] = doc.items.map((it) => {
    const lot = lotByBarcode.get(it.barcode)!;
    return {
      lotId: lot.id,
      barcode: it.barcode,
      productId: lot.productId,
      previousHadVideo: !!lot.videoUrl,
      isOpen: it.isOpen,
      hasVideo: it.hasVideo,
      isTarget: it.isTarget,
      youtubeUrl: it.youtubeUrl,
      description: it.description,
      comment: it.comment,
      onAir: it.onAir,
      onAirDelivery: it.onAirDelivery,
      reservedAgentUserId: it.reservedAgentUserId,
      reservedAgentName: it.reservedAgentUserId
        ? (agentName.get(it.reservedAgentUserId) ?? null)
        : null,
      reservedClientId: it.reservedClientId,
      reservedClientName: it.reservedClientId
        ? (clientName.get(it.reservedClientId) ?? null)
        : null,
      reservedUntil: it.reservedUntil,
      sector: it.sector,
    };
  });

  const plan = buildBagStateApply({
    recorderDocId: doc.id,
    occurredAt: doc.docDate,
    changedByUserId: userId,
    lines,
  });

  // 4. Транзакція: оновити лоти + журнал (delete-then-write) + шапка → posted.
  await db.$transaction(async (tx) => {
    for (const u of plan.lotUpdates) {
      let sectorId: string | null = null;
      if (u.sectorName && u.sectorName.trim()) {
        sectorId = await findOrCreateSector(tx, u.sectorName.trim());
      }
      await tx.lot.update({
        where: { id: u.lotId },
        data: { ...u.data, sectorId },
      });
    }
    // Записати зарезолвлені lotId/productId у рядки документа (за barcode).
    for (const line of lines) {
      await tx.bagStateChangeItem.updateMany({
        where: { documentId: doc.id, barcode: line.barcode },
        data: { lotId: line.lotId, productId: line.productId },
      });
    }
    await tx.lotStateHistory.deleteMany({ where: { recorderDocId: doc.id } });
    if (plan.historyRows.length > 0) {
      await tx.lotStateHistory.createMany({ data: plan.historyRows });
    }
    await tx.bagStateChange.update({
      where: { id: doc.id },
      data: {
        status: "posted",
        postedAt: new Date(),
        postedByUserId: userId,
      },
    });
  });

  // 5. Відео-нагадування (best-effort, поза транзакцією — не валить проведення).
  let videoRemindersCreated = 0;
  for (const t of plan.videoTriggers) {
    try {
      await db.mgrReminder.create({
        data: {
          ownerUserId: t.reservedAgentUserId,
          clientId: t.reservedClientId,
          body: `Скинути відео у Viber: мішок ${t.barcode}`,
          remindAt: doc.docDate ?? new Date(),
          periodicity: "event",
          orderVideo: true,
          actionType: "viber_video",
          source: "auto_video",
          lotId: t.lotId,
          productId: t.productId,
        },
      });
      videoRemindersCreated += 1;
    } catch (e) {
      console.warn("[L-TEX] Failed to create bag-state video reminder", {
        docId,
        barcode: t.barcode,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    itemsUpdated: plan.lotUpdates.length,
    videoRemindersCreated,
    missingBarcodes: [],
  };
}

/**
 * Реверс проведення (при DELETE/cancel): видаляє журнал історії за реєстратором.
 * Стан лотів НЕ відкочується (журнальна семантика — попередній стан лишається у
 * попередніх записах історії/інших документах). Best-effort — не кидає.
 */
export async function removeBagStateChange(
  docId: string,
  db: PrismaClient = prisma,
): Promise<void> {
  try {
    await db.lotStateHistory.deleteMany({ where: { recorderDocId: docId } });
  } catch (e) {
    console.warn("[L-TEX] Failed to reverse bag-state history", {
      docId,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
