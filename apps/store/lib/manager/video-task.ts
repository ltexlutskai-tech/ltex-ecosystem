import { prisma } from "@ltex/db";
import { isActiveReservation } from "@/lib/manager/lot-booking";
import { buildBronEventBody } from "@/lib/manager/client-timeline";

/**
 * Блок «Відеозона» — оркестрація завдань на відеоогляд (по МІШКАХ).
 *
 * Одне замовлення = одне завдання (`MgrVideoTask`) на N одиниць (quantity).
 * Склад сканує по одному ШК на кожен мішок → кожен стає рядком `MgrVideoTaskBag`
 * і одразу бронюється на клієнта до 23:59 наступного дня. Коли зібрано всі
 * заплановані мішки — завдання переходить у зйомку (`filming`). Відеозона знімає
 * й описує КОЖЕН мішок окремо (свій ШК/вага/к-сть/відео/опис); спільні
 * характеристики (сезон/сорт/стать/розміри) — на завданні. «Готово» доступне,
 * коли кожен мішок має сформований YouTube-опис: характеристики пишуться у
 * товар/лоти, бронь оновлюється, менеджеру приходить сповіщення на кожен мішок
 * (кнопка «Надіслати відео клієнту»).
 */

/** Кінець наступного дня (23:59:59.999 завтра) від `now`. */
export function endOfTomorrow(now: Date): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Чи блокує бронь лоту сканування у відеозавдання (чиста, з тестами).
 *
 * Власна бронь менеджера-замовника — його потреба: він сам вирішує віддати
 * свій заброньований мішок під відео (навіть для іншого свого клієнта), тому
 * скан проходить. Блокуємо лише АКТИВНУ бронь ІНШОГО менеджера (або бронь без
 * менеджера у завдання без менеджера — нема кому «дозволити»).
 */
export function blocksVideoTaskScan(
  lot: {
    status: string;
    reservedByUserId: string | null;
    reservedUntil: Date | null;
  },
  taskManagerUserId: string | null,
  now: Date,
): boolean {
  if (!isActiveReservation(lot, now)) return false;
  if (taskManagerUserId == null) return true;
  return lot.reservedByUserId !== taskManagerUserId;
}

/** Бронь чужого менеджера — з деталями для людського повідомлення складу. */
export class VideoBagReservedError extends Error {
  constructor(
    public readonly reservedByName: string | null,
    public readonly reservedUntil: Date | null,
  ) {
    super("RESERVED");
    this.name = "VideoBagReservedError";
  }
}

export interface CreateVideoTaskArgs {
  productId: string;
  clientId: string; // MgrClient.id
  quantity: number;
  requestedBarcode?: string | null;
  manager: { id: string; fullName: string };
}

/** Створює завдання на відеоогляд (статус `new`, ще без мішків). */
export async function createVideoTask(args: CreateVideoTaskArgs): Promise<{
  id: string;
}> {
  const [product, client] = await Promise.all([
    prisma.product.findUnique({
      where: { id: args.productId },
      select: {
        id: true,
        name: true,
        articleCode: true,
        code1C: true,
        season: true,
        quality: true,
        gender: true,
        sizes: true,
      },
    }),
    prisma.mgrClient.findUnique({
      where: { id: args.clientId },
      select: { id: true, name: true, code1C: true },
    }),
  ]);
  if (!product) throw new Error("PRODUCT_NOT_FOUND");
  if (!client) throw new Error("CLIENT_NOT_FOUND");

  let customerId: string | null = null;
  if (client.code1C) {
    const customer = await prisma.customer.findFirst({
      where: { code1C: client.code1C },
      select: { id: true },
    });
    customerId = customer?.id ?? null;
  }

  const created = await prisma.mgrVideoTask.create({
    data: {
      status: "new",
      managerUserId: args.manager.id,
      managerName: args.manager.fullName,
      clientId: client.id,
      clientName: client.name,
      customerId,
      productId: product.id,
      productName: product.name,
      articleCode: product.articleCode,
      quantity: Math.max(1, args.quantity),
      requestedBarcode: args.requestedBarcode?.trim() || null,
      season: product.season || null,
      quality: product.quality || null,
      gender: product.gender,
      sizes: product.sizes,
    },
    select: { id: true },
  });
  return created;
}

/** Дані бронювання лота на клієнта завдання (у транзакції). */
export function videoReservationData(
  task: {
    clientId: string | null;
    clientName: string | null;
    managerUserId: string | null;
    managerName: string | null;
  },
  until: Date,
): Record<string, unknown> {
  return {
    status: "reserved",
    reservedForClientId: task.clientId,
    reservedForName: task.clientName,
    reservedByUserId: task.managerUserId,
    reservedByName: task.managerName,
    reservedUntil: until,
  };
}

/**
 * Склад сканує мішок → додає його у завдання (рядок `MgrVideoTaskBag`) і одразу
 * бронює лот на клієнта. Кидає типізовані помилки для роуту.
 */
export async function addVideoTaskBag(opts: {
  taskId: string;
  barcode?: string | null;
  lotId?: string | null;
  actor: { id: string; fullName: string };
  now?: Date;
}): Promise<{ barcode: string }> {
  const now = opts.now ?? new Date();
  const task = await prisma.mgrVideoTask.findUnique({
    where: { id: opts.taskId },
    include: { bags: { select: { id: true, barcode: true } } },
  });
  if (!task) throw new Error("TASK_NOT_FOUND");
  if (task.status !== "new") throw new Error("NOT_COLLECTING");
  if (task.bags.length >= task.quantity) throw new Error("ENOUGH_BAGS");

  const lot = opts.lotId
    ? await prisma.lot.findUnique({ where: { id: opts.lotId } })
    : await prisma.lot.findFirst({ where: { barcode: opts.barcode ?? "" } });
  if (!lot) throw new Error("LOT_NOT_FOUND");
  if (lot.productId !== task.productId) throw new Error("WRONG_PRODUCT");
  if (task.bags.some((b) => b.barcode === lot.barcode)) {
    throw new Error("ALREADY_ADDED");
  }
  // Бронь самого менеджера-замовника НЕ блокує (його потреба — його рішення);
  // чужа активна бронь — блокує з деталями «хто/до коли».
  if (
    blocksVideoTaskScan(
      {
        status: lot.status,
        reservedByUserId: lot.reservedByUserId,
        reservedUntil: lot.reservedUntil,
      },
      task.managerUserId,
      now,
    )
  ) {
    throw new VideoBagReservedError(lot.reservedByName, lot.reservedUntil);
  }

  const until = endOfTomorrow(now);
  await prisma.$transaction(async (tx) => {
    await tx.mgrVideoTaskBag.create({
      data: {
        taskId: task.id,
        status: "pending",
        lotId: lot.id,
        barcode: lot.barcode,
        weight: lot.weight,
        lotWeightKg: lot.weight,
        broughtByUserId: opts.actor.id,
        broughtByName: opts.actor.fullName,
        broughtAt: now,
      },
    });
    await tx.lot.update({
      where: { id: lot.id },
      data: videoReservationData(task, until),
    });
    if (task.clientId) {
      await tx.mgrClientTimelineEntry.create({
        data: {
          clientId: task.clientId,
          kind: "bron",
          body: buildBronEventBody(lot.barcode, until),
          occurredAt: now,
          authorUserId: opts.actor.id,
          metadata: {
            lotId: lot.id,
            barcode: lot.barcode,
            weight: lot.weight,
            reservedUntil: until.toISOString(),
            videoTaskId: task.id,
          },
        },
      });
    }
  });
  return { barcode: lot.barcode };
}

/**
 * Прибирає мішок із завдання (склад не несе його на відео) і знімає бронь з
 * лота (лише якщо це бронь цього завдання — не чіпаємо чужу).
 */
export async function removeVideoTaskBag(opts: {
  taskId: string;
  bagId: string;
}): Promise<void> {
  const bag = await prisma.mgrVideoTaskBag.findUnique({
    where: { id: opts.bagId },
    include: { task: { select: { id: true, status: true, clientId: true } } },
  });
  if (!bag || bag.taskId !== opts.taskId) throw new Error("BAG_NOT_FOUND");
  if (bag.task.status !== "new") throw new Error("NOT_COLLECTING");

  await prisma.$transaction(async (tx) => {
    if (bag.lotId) {
      // Знімаємо бронь лише якщо вона належить цьому завданню/клієнту.
      const lot = await tx.lot.findUnique({
        where: { id: bag.lotId },
        select: { reservedForClientId: true },
      });
      if (lot && lot.reservedForClientId === bag.task.clientId) {
        await tx.lot.update({
          where: { id: bag.lotId },
          data: {
            status: "free",
            reservedForClientId: null,
            reservedForName: null,
            reservedByUserId: null,
            reservedByName: null,
            reservedUntil: null,
          },
        });
      }
    }
    await tx.mgrVideoTaskBag.delete({ where: { id: bag.id } });
  });
}

/**
 * Вилучає відеозавдання (рішення user 2026-07-24: видаляти може той, хто його
 * створив — менеджер-замовник, або admin/owner; перевірка прав — у роуті).
 *
 * Для НЕзавершеного завдання (new/filming) знімає броні, які поставило саме це
 * завдання (бронь на клієнта завдання) — як `removeVideoTaskBag`. Для
 * завершеного (done) броні НЕ чіпаємо: після зйомки це вже робоча бронь
 * клієнта, її можна зняти окремо через «Вилучити бронь» у Прайсі.
 * Мішки завдання видаляються каскадом.
 */
export async function deleteVideoTask(opts: { taskId: string }): Promise<void> {
  const task = await prisma.mgrVideoTask.findUnique({
    where: { id: opts.taskId },
    include: { bags: { select: { id: true, lotId: true } } },
  });
  if (!task) throw new Error("TASK_NOT_FOUND");

  await prisma.$transaction(async (tx) => {
    if (task.status !== "done") {
      for (const bag of task.bags) {
        if (!bag.lotId) continue;
        const lot = await tx.lot.findUnique({
          where: { id: bag.lotId },
          select: { reservedForClientId: true },
        });
        if (lot && lot.reservedForClientId === task.clientId) {
          await tx.lot.update({
            where: { id: bag.lotId },
            data: {
              status: "free",
              reservedForClientId: null,
              reservedForName: null,
              reservedByUserId: null,
              reservedByName: null,
              reservedUntil: null,
            },
          });
        }
      }
    }
    await tx.mgrVideoTask.delete({ where: { id: task.id } });
  });
}

/** Склад завершив збирання мішків → завдання переходить у зйомку. */
export async function advanceVideoTaskToFilming(taskId: string): Promise<void> {
  const task = await prisma.mgrVideoTask.findUnique({
    where: { id: taskId },
    include: { bags: { select: { id: true } } },
  });
  if (!task) throw new Error("TASK_NOT_FOUND");
  if (task.status !== "new") throw new Error("NOT_COLLECTING");
  if (task.bags.length < 1) throw new Error("NO_BAGS");

  await prisma.mgrVideoTask.update({
    where: { id: taskId },
    data: {
      status: "filming",
      // Синхронізуємо заплановану к-сть із фактично зібраною.
      quantity: task.bags.length,
      broughtAt: new Date(),
    },
  });
}

/**
 * «Готово»: пише спільні характеристики у товар, по кожному мішку — відео/вагу
 * у лот + оновлює бронь, ставить завдання й мішки `done`, і надсилає менеджеру
 * інтерактивне нагадування на КОЖЕН мішок. Вимагає, щоб кожен мішок мав опис.
 */
export async function completeVideoTask(opts: {
  taskId: string;
  actorUserId: string;
  now?: Date;
}): Promise<void> {
  const now = opts.now ?? new Date();
  const task = await prisma.mgrVideoTask.findUnique({
    where: { id: opts.taskId },
    include: { bags: true },
  });
  if (!task) throw new Error("TASK_NOT_FOUND");
  if (task.status === "done") return;
  if (task.bags.length < 1) throw new Error("NO_LOT");
  const missing = task.bags.some(
    (b) => !b.youtubeDescription || !b.youtubeDescription.trim(),
  );
  if (missing) throw new Error("NO_DESCRIPTION");

  const until = endOfTomorrow(now);

  await prisma.$transaction(async (tx) => {
    // Спільні характеристики → товар (порожні не перетирають обовʼязкові поля).
    const productData: Record<string, unknown> = {};
    if (task.quality && task.quality.trim()) productData.quality = task.quality;
    if (task.season && task.season.trim()) productData.season = task.season;
    if (task.gender != null) productData.gender = task.gender || null;
    if (task.sizes != null) productData.sizes = task.sizes || null;
    if (Object.keys(productData).length > 0) {
      await tx.product.update({
        where: { id: task.productId },
        data: productData,
      });
    }

    // Кожен мішок: відео/вага → лот + бронь; статус bag → done.
    for (const bag of task.bags) {
      if (bag.lotId) {
        const lotData: Record<string, unknown> = {
          videoDate: now,
          ...videoReservationData(task, until),
        };
        if (bag.videoUrl && bag.videoUrl.trim())
          lotData.videoUrl = bag.videoUrl;
        if (bag.lotWeightKg != null && Number.isFinite(bag.lotWeightKg)) {
          lotData.weight = bag.lotWeightKg;
        }
        await tx.lot.update({ where: { id: bag.lotId }, data: lotData });
      }
      await tx.mgrVideoTaskBag.update({
        where: { id: bag.id },
        data: { status: "done" },
      });
    }

    await tx.mgrVideoTask.update({
      where: { id: task.id },
      data: {
        status: "done",
        completedAt: now,
        completedByUserId: opts.actorUserId,
      },
    });

    if (task.clientId) {
      await tx.mgrClientTimelineEntry.create({
        data: {
          clientId: task.clientId,
          kind: "bron",
          body: `Відеоогляд готовий (${task.bags.length} міш.) — заброньовано до ${until.toLocaleDateString("uk-UA")}`,
          occurredAt: now,
          authorUserId: opts.actorUserId,
          metadata: { videoTaskId: task.id, bags: task.bags.length },
        },
      });
    }
  });

  // Нагадування менеджеру — на кожен мішок (кожне відео шариться окремо).
  if (task.managerUserId) {
    for (const bag of task.bags) {
      try {
        await prisma.mgrReminder.create({
          data: {
            ownerUserId: task.managerUserId,
            clientId: task.clientId,
            productId: task.productId,
            lotId: bag.lotId,
            body: `Відео готове: ${task.productName}${bag.barcode ? " · " + bag.barcode : ""} для ${task.clientName ?? "клієнта"}. Надішліть клієнту.`,
            remindAt: now,
            periodicity: "event",
            orderVideo: true,
            actionType: "viber_video",
            source: "auto_video",
          },
        });
      } catch (err) {
        console.error("[L-TEX] completeVideoTask notify failed", {
          taskId: task.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
