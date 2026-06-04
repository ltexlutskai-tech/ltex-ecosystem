import { prisma } from "@ltex/db";
import { generateLotBarcode } from "./barcode-generator";

/**
 * Проведення документа поступлення (← Тиждень 2 блоку Поступлення).
 *
 * Аналог 1С `ОбработкаПроведения` для документа `ПоступленняТоварівУслуг`.
 * Транзакційно:
 *   1. Перевіряє статус (тільки draft → posted)
 *   2. Для кожного рядка:
 *        - Якщо `quantity > 1` — створює N окремих лотів (кожен мішок — свій)
 *        - Конвертує `purchasePrice` у EUR через `exchangeRate`
 *        - Якщо `barcode` не вказано — генерує через `generateLotBarcode`
 *        - Створює `Lot` з усіма полями (supplierId, receivingId,
 *          purchasePriceEur, weight, barcode, productId)
 *        - Прив'язує `receivingItem.createdLotId`
 *   3. Виставляє `receiving.status='posted'`, `postedAt`, `postedByUserId`
 *
 * НЕ ВИКЛИКАЄТЬСЯ паралельно для того ж документа (захищено перевіркою
 * status — другий виклик отримає 409).
 *
 * @param receivingId  ID документа
 * @param userId       Хто проводить (для аудиту)
 */
export interface PostReceivingResult {
  receivingId: string;
  lotsCreated: number;
  totalWeight: number;
  totalAmount: number;
}

export async function postReceiving(
  receivingId: string,
  userId: string,
): Promise<PostReceivingResult> {
  // Завантажуємо документ + рядки + товари (для генерації штрихкодів)
  const doc = await prisma.receiving.findUnique({
    where: { id: receivingId },
    include: {
      items: {
        include: {
          product: {
            select: { id: true, articleCode: true, code1C: true },
          },
        },
      },
    },
  });

  if (!doc) throw new ReceivingError("not_found", "Документ не знайдено");
  if (doc.status !== "draft")
    throw new ReceivingError(
      "invalid_status",
      `Документ уже у статусі "${doc.status}", провести не можна`,
    );
  if (doc.items.length === 0)
    throw new ReceivingError(
      "empty",
      "Документ порожній — додайте хоча б один рядок",
    );

  // Перед проведенням генеруємо штрихкоди для рядків з `barcodeSource=generated`
  // і `barcode=null`. Робимо ПОЗА транзакцією бо потребує множинних читань;
  // race-захист — унікальний constraint на `lots.barcode` всередині transaction.
  const generatedBarcodes = new Map<string, string[]>(); // itemId -> [barcodes]
  for (const item of doc.items) {
    if (item.barcodeSource === "generated" || !item.barcode) {
      const codes: string[] = [];
      for (let i = 0; i < item.quantity; i++) {
        codes.push(await generateLotBarcode(item.productId));
      }
      generatedBarcodes.set(item.id, codes);
    } else {
      // Для scanned/manual — або один штрихкод (quantity=1), або користувач
      // мав ввести `quantity` штрихкодів. Поки підтримуємо тільки quantity=1
      // у scanned/manual режимах — інакше треба окремий API.
      if (item.quantity > 1) {
        throw new ReceivingError(
          "invalid_quantity",
          `Рядок з ШК-кодом "${item.barcode}": quantity > 1 не підтримується ` +
            `для scanned/manual режимів. Розбийте на окремі рядки або переключіть на generated.`,
        );
      }
      generatedBarcodes.set(item.id, [item.barcode]);
    }
  }

  // Транзакція: створюємо лоти + оновлюємо receiving + рядки
  const result = await prisma.$transaction(async (tx) => {
    let lotsCreated = 0;
    let totalWeight = 0;
    let totalAmount = 0;

    for (const item of doc.items) {
      const barcodes = generatedBarcodes.get(item.id) ?? [];
      // Конвертація закупкової ціни у EUR (документ у валюті `doc.currency`,
      // курс — кількість грн/USD за 1 EUR). Якщо валюта = EUR — без зміни.
      const purchasePriceEur =
        doc.currency === "EUR"
          ? item.purchasePrice
          : item.purchasePrice / doc.exchangeRate;

      const createdLotIds: string[] = [];
      for (const barcode of barcodes) {
        const lot = await tx.lot.create({
          data: {
            productId: item.productId,
            barcode,
            weight: item.weight,
            quantity: 1,
            status: "free",
            // Продажна ціна виставляється потім менеджером у Прайсі.
            // Поки що = собівартість (placeholder, видно у admin).
            priceEur: 0,
            supplierId: doc.supplierId,
            receivingId: doc.id,
            purchasePriceEur,
            arrivalDate: doc.docDate,
            sector: item.sector ?? null,
          },
        });
        createdLotIds.push(lot.id);
        lotsCreated++;
        totalWeight += item.weight;
        totalAmount += item.weight * item.purchasePrice;
      }

      // Прив'язуємо перший створений лот до рядка (для трекінгу). Якщо їх
      // багато (quantity > 1) — інші просто мають receivingId і знаходяться
      // через зворотний relation `receiving.lots`.
      if (createdLotIds[0]) {
        await tx.receivingItem.update({
          where: { id: item.id },
          data: { createdLotId: createdLotIds[0] },
        });
      }
    }

    // Реєструємо ціни закупки (Хвиля 2 правок). Для кожного рядка з price > 0
    // пишемо запис у регістр історії — щоб наступного разу автопідставляти
    // останню ціну при додаванні товару з тим самим постачальником.
    for (const item of doc.items) {
      if (item.purchasePrice > 0) {
        await tx.purchasePrice.create({
          data: {
            productId: item.productId,
            supplierId: doc.supplierId,
            // Конвертуємо у EUR (документ завжди у EUR — узгоджено 2026-06-04)
            priceEur: item.purchasePrice,
            validFrom: doc.docDate,
            source: "receiving",
            receivingId: doc.id,
            receivingItemId: item.id,
          },
        });
      }
    }

    // Оновлюємо документ
    await tx.receiving.update({
      where: { id: doc.id },
      data: {
        status: "posted",
        postedAt: new Date(),
        postedByUserId: userId,
        totalWeight,
        totalAmount,
        totalQuantity: lotsCreated,
      },
    });

    return {
      receivingId: doc.id,
      lotsCreated,
      totalWeight: round3(totalWeight),
      totalAmount: round2(totalAmount),
    };
  });

  return result;
}

/**
 * Скасування проведення (← Тиждень 2). Тільки admin/owner — узгоджено з user.
 * Видаляє створені лоти АБО м'яко (статус 'cancelled')? Узгоджено: «А — тільки
 * admin/owner» — отже жорстке видалення лотів безпечно, якщо вони не задіяні
 * у замовленнях/реалізаціях. Перевіряємо це.
 */
export async function cancelPostedReceiving(
  receivingId: string,
  userId: string,
  reason: string,
): Promise<void> {
  const doc = await prisma.receiving.findUnique({
    where: { id: receivingId },
    include: {
      lots: {
        select: {
          id: true,
          status: true,
          orderItems: { select: { id: true } },
          saleItems: { select: { id: true } },
        },
      },
    },
  });
  if (!doc) throw new ReceivingError("not_found", "Документ не знайдено");
  if (doc.status !== "posted")
    throw new ReceivingError(
      "invalid_status",
      `Скасувати можна тільки проведений документ (поточний: "${doc.status}")`,
    );

  // Захист: якщо хоч один лот вже у замовленні/реалізації — забороняємо
  const blockedLots = doc.lots.filter(
    (l) =>
      l.orderItems.length > 0 || l.saleItems.length > 0 || l.status !== "free",
  );
  if (blockedLots.length > 0) {
    throw new ReceivingError(
      "lots_in_use",
      `Не можна скасувати: ${blockedLots.length} лот(ів) уже у роботі (замовлення/реалізації/бронь). ` +
        `Спершу зніміть прив'язки.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    // Видалити лоти створені цим документом
    await tx.lot.deleteMany({ where: { receivingId: doc.id } });
    // Оновити документ
    await tx.receiving.update({
      where: { id: doc.id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledByUserId: userId,
        cancelReason: reason,
      },
    });
    // Очистити createdLotId на рядках
    await tx.receivingItem.updateMany({
      where: { receivingId: doc.id },
      data: { createdLotId: null },
    });
  });
}

export class ReceivingError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ReceivingError";
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
