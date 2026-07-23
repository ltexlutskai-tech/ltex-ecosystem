import { prisma } from "@ltex/db";

/**
 * Блок «Відеозона» — оркестрація завдань на відеоогляд.
 *
 * Потік: менеджер замовляє огляд з Прайсу/картки клієнта → `createVideoTask`
 * (статус `new` = складу треба принести мішок) → склад приносить рандомний
 * вільний мішок (`bring` у роуті → `filming`) → відеозона заповнює
 * характеристики + посилання на відео + формує YouTube-опис → «Готово»
 * (`completeVideoTask`): характеристики пишуться у товар/лот, лот бронюється на
 * клієнта+менеджера до 23:59 наступного дня, менеджеру приходить інтерактивне
 * нагадування «відео готове» (`viber_video`) з дією «Надіслати відео клієнту».
 */

/** Кінець наступного дня (23:59:59.999 завтра) від `now`. */
export function endOfTomorrow(now: Date): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(23, 59, 59, 999);
  return d;
}

export interface CreateVideoTaskArgs {
  productId: string;
  clientId: string; // MgrClient.id
  quantity: number;
  requestedBarcode?: string | null;
  manager: { id: string; fullName: string };
}

/**
 * Створює завдання на відеоогляд (статус `new`). Резолвить назву товару/артикул
 * і назву клієнта (+ дзеркальний Customer.id по code1C для сумісності). Кидає
 * помилку, якщо товар/клієнт не знайдено (роут перетворює на 4xx).
 */
export async function createVideoTask(args: CreateVideoTaskArgs): Promise<{
  id: string;
}> {
  const [product, client] = await Promise.all([
    prisma.product.findUnique({
      where: { id: args.productId },
      select: { id: true, name: true, articleCode: true, code1C: true },
    }),
    prisma.mgrClient.findUnique({
      where: { id: args.clientId },
      select: { id: true, name: true, code1C: true },
    }),
  ]);
  if (!product) throw new Error("PRODUCT_NOT_FOUND");
  if (!client) throw new Error("CLIENT_NOT_FOUND");

  // Дзеркальний Customer (по code1C) — best-effort, для сумісності з бронюванням
  // на боці магазину. Відсутність не блокує.
  let customerId: string | null = null;
  if (client.code1C) {
    const customer = await prisma.customer.findFirst({
      where: { code1C: client.code1C },
      select: { id: true },
    });
    customerId = customer?.id ?? null;
  }

  const requested = args.requestedBarcode?.trim() || null;

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
      quantity: args.quantity,
      requestedBarcode: requested,
    },
    select: { id: true },
  });
  return created;
}

/**
 * «Готово»: пише характеристики у товар/лот, бронює лот на клієнта+менеджера до
 * 23:59 наступного дня, ставить завдання `done`, створює менеджеру інтерактивне
 * нагадування «відео готове». Усе в одній транзакції; сповіщення best-effort
 * після коміту (не валить операцію).
 */
export async function completeVideoTask(opts: {
  taskId: string;
  actorUserId: string;
  now?: Date;
}): Promise<void> {
  const now = opts.now ?? new Date();

  const task = await prisma.mgrVideoTask.findUnique({
    where: { id: opts.taskId },
  });
  if (!task) throw new Error("TASK_NOT_FOUND");
  if (task.status === "done") return; // ідемпотентно
  if (!task.lotId) throw new Error("NO_LOT");
  if (!task.youtubeDescription || !task.youtubeDescription.trim()) {
    throw new Error("NO_DESCRIPTION");
  }

  const until = endOfTomorrow(now);

  await prisma.$transaction(async (tx) => {
    // 1. Характеристики → товар (порожні значення не перетирають обовʼязкові
    //    поля quality/season).
    const productData: Record<string, unknown> = {};
    if (task.quality && task.quality.trim()) productData.quality = task.quality;
    if (task.season && task.season.trim()) productData.season = task.season;
    if (task.gender != null) productData.gender = task.gender || null;
    if (task.sizes != null) productData.sizes = task.sizes || null;
    if (task.unitsCount != null)
      productData.unitsPerKg = task.unitsCount || null;
    if (task.unitWeight != null)
      productData.unitWeight = task.unitWeight || null;
    if (Object.keys(productData).length > 0) {
      await tx.product.update({
        where: { id: task.productId },
        data: productData,
      });
    }

    // 2. Відео + вага → лот, + бронь на клієнта/менеджера до завтра 23:59.
    const lotData: Record<string, unknown> = {
      videoDate: now,
      status: "reserved",
      reservedForClientId: task.clientId,
      reservedForName: task.clientName,
      reservedByUserId: task.managerUserId,
      reservedByName: task.managerName,
      reservedUntil: until,
    };
    if (task.videoUrl && task.videoUrl.trim()) lotData.videoUrl = task.videoUrl;
    if (task.lotWeightKg != null && Number.isFinite(task.lotWeightKg)) {
      lotData.weight = task.lotWeightKg;
    }
    await tx.lot.update({ where: { id: task.lotId! }, data: lotData });

    // 3. Завдання → done.
    await tx.mgrVideoTask.update({
      where: { id: task.id },
      data: {
        status: "done",
        completedAt: now,
        completedByUserId: opts.actorUserId,
      },
    });

    // 4. Таймлайн клієнта (бронь) — best-effort всередині tx.
    if (task.clientId) {
      await tx.mgrClientTimelineEntry.create({
        data: {
          clientId: task.clientId,
          kind: "bron",
          body: `Відеоогляд готовий — лот ${task.barcode ?? ""} заброньовано до ${until.toLocaleDateString("uk-UA")}`,
          occurredAt: now,
          authorUserId: opts.actorUserId,
          metadata: {
            lotId: task.lotId,
            barcode: task.barcode,
            reservedUntil: until.toISOString(),
            videoTaskId: task.id,
          },
        },
      });
    }
  });

  // 5. Нагадування менеджеру «відео готове» — інтерактивне (viber_video) →
  //    у списку зʼявиться кнопка «Надіслати відео клієнту». Best-effort.
  if (task.managerUserId) {
    try {
      await prisma.mgrReminder.create({
        data: {
          ownerUserId: task.managerUserId,
          clientId: task.clientId,
          productId: task.productId,
          lotId: task.lotId,
          body: `Відео готове: ${task.productName}${task.barcode ? " · " + task.barcode : ""} для ${task.clientName ?? "клієнта"}. Надішліть клієнту.`,
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
