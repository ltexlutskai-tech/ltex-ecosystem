import { prisma } from "@ltex/db";

/**
 * Авто-генеровані нагадування (блок «Нагадування», Етап 4).
 *
 * Два детектори, що крутяться по cron-у (`/api/cron/generate-reminders`):
 *
 *  • **Бронь минула** (`auto_bron`) — лот, у якого бронь протермінована
 *    (`reservedUntil < now`), отримує авто-нагадування «Перенести бронь?» для
 *    менеджера, що бронював. Після створення нагадування бронь **знімається**
 *    (лот → `free`) — це і прибирає лот зі сканування наступного запуску
 *    (природний антидубль) + не дає лоту висіти у «reserved» назавжди.
 *
 *  • **З'явилось відео** (`auto_video`) — «нагадування-стеження» (створені
 *    сценарієм «Замовити відео» у Прайсі: `orderVideo=true, actionType=none,
 *    source=manual`) спрацьовують, коли на пов'язаному лоті/товарі з'явився
 *    `videoUrl`. Спрацьоване → `actionType=viber_video, source=auto_video`
 *    (після перемикання `actionType != none` → не матчиться повторно).
 *
 * Дані спільні з магазином (`Lot`/`Product`) — `lotId`/`productId` у нагадуванні
 * лишаються плоскими скалярами (без relations), як у Маршрутному листі.
 */

export interface GenerateRemindersResult {
  bronCreated: number;
  videoFired: number;
}

/** Детектор A — знімає протерміновані броні + створює нагадування «Перенести бронь?». */
export async function detectExpiredBookings(
  now: Date = new Date(),
): Promise<number> {
  const lots = await prisma.lot.findMany({
    where: {
      status: "reserved",
      reservedUntil: { lt: now },
      reservedForClientId: { not: null },
      reservedByUserId: { not: null },
    },
    select: {
      id: true,
      barcode: true,
      productId: true,
      reservedForClientId: true,
      reservedForName: true,
      reservedByUserId: true,
      product: { select: { articleCode: true } },
    },
  });

  let created = 0;

  for (const lot of lots) {
    // Типажні гарди (where вже фільтрує, але TS не звужує `String | null`).
    const clientId = lot.reservedForClientId;
    const ownerUserId = lot.reservedByUserId;
    if (!clientId || !ownerUserId) continue;

    // Антидубль: чи вже є активне нагадування «продовжити бронь» по цьому
    // лоту+клієнту. (Зняття броні нижче теж не дасть лоту з'явитись наступного
    // запуску — це другий рівень захисту.)
    const existing = await prisma.mgrReminder.findFirst({
      where: {
        lotId: lot.id,
        clientId,
        actionType: "continue_bron",
        completedAt: null,
      },
      select: { id: true },
    });
    if (existing) continue;

    const article = lot.product?.articleCode ?? "—";
    const forName = lot.reservedForName ?? "—";
    const body = `По артикулу ${article} мішку ${lot.barcode} для контрагента ${forName} була знята бронь. Перенести бронь?`;

    await prisma.$transaction([
      prisma.mgrReminder.create({
        data: {
          ownerUserId,
          clientId,
          body,
          actionType: "continue_bron",
          source: "auto_bron",
          lotId: lot.id,
          productId: lot.productId,
          periodicity: "none",
          remindAt: now,
        },
      }),
      // Знімаємо протерміновану бронь (лот → вільний). Це звільняє лот і
      // прибирає його зі сканування наступного запуску.
      prisma.lot.update({
        where: { id: lot.id },
        data: {
          status: "free",
          reservedUntil: null,
          reservedForClientId: null,
          reservedForName: null,
          reservedByUserId: null,
          reservedByName: null,
        },
      }),
    ]);

    created += 1;
  }

  return created;
}

/** Детектор B — «спрацьовує» нагадування-стеження за відео, коли відео з'явилось. */
export async function detectVideoAppeared(
  now: Date = new Date(),
): Promise<number> {
  const watches = await prisma.mgrReminder.findMany({
    where: {
      orderVideo: true,
      completedAt: null,
      actionType: "none",
      source: "manual",
    },
    select: {
      id: true,
      lotId: true,
      productId: true,
      client: { select: { name: true } },
    },
  });
  if (watches.length === 0) return 0;

  // Batch-lookup усіх пов'язаних лотів/товарів одним findMany кожного.
  const lotIds = [
    ...new Set(
      watches.map((w) => w.lotId).filter((v): v is string => v != null),
    ),
  ];
  const productIds = [
    ...new Set(
      watches.map((w) => w.productId).filter((v): v is string => v != null),
    ),
  ];

  const [lots, products] = await Promise.all([
    lotIds.length
      ? prisma.lot.findMany({
          where: { id: { in: lotIds } },
          select: {
            id: true,
            barcode: true,
            videoUrl: true,
            product: { select: { articleCode: true } },
          },
        })
      : Promise.resolve([]),
    productIds.length
      ? prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, articleCode: true, videoUrl: true },
        })
      : Promise.resolve([]),
  ]);

  const lotById = new Map(lots.map((l) => [l.id, l]));
  const productById = new Map(products.map((p) => [p.id, p]));

  let fired = 0;

  for (const w of watches) {
    let hasVideo = false;
    let article = "—";
    let barcode: string | null = null;

    if (w.lotId) {
      const lot = lotById.get(w.lotId);
      if (lot) {
        hasVideo = lot.videoUrl != null;
        article = lot.product?.articleCode ?? "—";
        barcode = lot.barcode;
      }
    } else if (w.productId) {
      const product = productById.get(w.productId);
      if (product) {
        hasVideo = product.videoUrl != null;
        article = product.articleCode ?? "—";
      }
    }

    if (!hasVideo) continue;

    const clientName = w.client?.name ?? "—";
    const body = `По артикулу ${article} мішку ${barcode ?? "—"} для контрагента ${clientName} з'явилось відео. Відправити у вайбер повідомлення?`;

    await prisma.mgrReminder.update({
      where: { id: w.id },
      data: {
        actionType: "viber_video",
        source: "auto_video",
        periodicity: "none",
        remindAt: now,
        body,
      },
    });

    fired += 1;
  }

  return fired;
}

/** Запускає обидва детектори. */
export async function generateAutoReminders(
  now: Date = new Date(),
): Promise<GenerateRemindersResult> {
  const bronCreated = await detectExpiredBookings(now);
  const videoFired = await detectVideoAppeared(now);
  return { bronCreated, videoFired };
}
