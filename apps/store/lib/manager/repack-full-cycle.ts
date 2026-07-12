import { Prisma, prisma, type PrismaClient } from "@ltex/db";
import { generateLotBarcode } from "../warehouse/barcode-generator";

/**
 * «Перепаковка» повного циклу (← 1С Документ.Перепаковка, ОбработкаПроведения).
 *
 * Розширює наявний `kind="repackings"` (stock-documents): при проведенні
 *   - джерельні мішки (`disassembled`) списуються фізично зі складу
 *     (status→"repacked_out", quantity→0, знімається бронь);
 *   - зібрані мішки (`assembled`) стають реальними лотами на полиці
 *     (новий ШК, вага, ціна продажу, сектор, дата поставки = дата документа);
 *   - собівартість джерельних мішків переноситься на нові пропорційно вазі
 *     і фіксується у регістрі `CostMovement`;
 *   - контроль ваги «розібрали − зібрали» → прапорець попередження (НЕ блокує).
 *
 * Рухи `StockMovement` (розхід розбору / прихід комплектації) пишуться наявним
 * хуком `applyStockDocumentMovements` — тут ми їх НЕ дублюємо.
 *
 * **Реєстратор** CostMovement: `repacking.code1C ?? repacking.id` (дзеркалить
 * `sale-movement-hooks.ts` — історичні hex не конфліктують з новими cuid).
 *
 * **Свідомо НЕ робимо** (немає живого 1С, лише управлінський облік): бух/подат
 * облік, партійний облік `ТоварыОрганизаций`, окремий регістр резервів/цін
 * товару. Ціна тримається на лоті (`Lot.priceEur`), собівартість — CostMovement.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ─── Чисте ядро (без I/O) ───────────────────────────────────────────────────

/** Джерельний рядок (розбір): вага + собівартість €/кг лота. */
export interface RepackSourceLine {
  weight: number;
  purchasePriceEur: number | null;
}

/** Зібраний рядок (комплектація): новий мішок. */
export interface RepackAssembledLine {
  itemId: string;
  productId: string | null;
  productCode1C: string | null;
  weight: number;
  quantity: number;
  /** ЦінаПродажуВес €/кг. */
  salePriceEur: number;
}

export interface RepackApplyInput {
  recorder: string;
  occurredAt: Date;
  toleranceKg: number;
  sources: RepackSourceLine[];
  assembled: RepackAssembledLine[];
}

/** Спланований новий лот (з рознесеною собівартістю). */
export interface RepackNewLotPlan {
  itemId: string;
  productId: string | null;
  weight: number;
  quantity: number;
  salePriceEur: number;
  costPerKgEur: number;
  costEur: number;
}

export interface RepackApplyPlan {
  inputWeight: number;
  outputWeight: number;
  lossWeight: number;
  /** Σ собівартості джерела, EUR. */
  totalSourceCostEur: number;
  /** Рознесена собівартість €/кг на нові мішки. */
  costPerKgEur: number;
  /** |вхід − вихід| > toleranceKg. */
  weightWarning: boolean;
  newLots: RepackNewLotPlan[];
  costRows: Prisma.CostMovementCreateManyInput[];
}

/**
 * Чистий core: рахує контроль ваги + пул собівартості + план нових лотів +
 * рядки регістру собівартості. Собівартість €/кг однакова на всі нові мішки
 * (пропорційний розподіл за вагою = costPerKg × вага_мішка).
 */
export function buildRepackApply(input: RepackApplyInput): RepackApplyPlan {
  const inputWeight = round2(
    input.sources.reduce((s, r) => s + (r.weight || 0), 0),
  );
  const outputWeightRaw = input.assembled.reduce(
    (s, r) => s + (r.weight || 0),
    0,
  );
  const outputWeight = round2(outputWeightRaw);
  const lossWeight = round2(inputWeight - outputWeight);

  const totalSourceCostEur = round2(
    input.sources.reduce(
      (s, r) => s + (r.purchasePriceEur ?? 0) * (r.weight || 0),
      0,
    ),
  );
  const costPerKgEur =
    outputWeightRaw > 0 ? round2(totalSourceCostEur / outputWeightRaw) : 0;

  const weightWarning =
    Math.abs(inputWeight - outputWeight) > input.toleranceKg;

  const newLots: RepackNewLotPlan[] = [];
  const costRows: Prisma.CostMovementCreateManyInput[] = [];

  input.assembled.forEach((a, idx) => {
    const costEur = round2(costPerKgEur * (a.weight || 0));
    newLots.push({
      itemId: a.itemId,
      productId: a.productId,
      weight: a.weight || 0,
      quantity: a.quantity || 1,
      salePriceEur: round2(a.salePriceEur || 0),
      costPerKgEur,
      costEur,
    });
    costRows.push({
      recorderCode1C: input.recorder,
      lineNo: idx + 1,
      productCode1C: a.productCode1C,
      productId: a.productId,
      qty: round3(a.quantity || 1),
      costEur,
      occurredAt: input.occurredAt,
    });
  });

  return {
    inputWeight,
    outputWeight,
    lossWeight,
    totalSourceCostEur,
    costPerKgEur,
    weightWarning,
    newLots,
    costRows,
  };
}

// ─── Оркестрація (БД) ───────────────────────────────────────────────────────

/** Інкрементує числовий суфікс ШК (для дедупу автоген-ШК одного товару у пачці). */
function bumpBarcode(code: string): string {
  const m = code.match(/^(.*?)(\d+)$/);
  if (!m || m[1] === undefined || m[2] === undefined) return `${code}-1`;
  const width = m[2].length;
  return `${m[1]}${String(parseInt(m[2], 10) + 1).padStart(width, "0")}`;
}

interface LoadedRepackItem {
  id: string;
  role: string;
  productId: string | null;
  barcode: string | null;
  sourceLotId: string | null;
  weight: number;
  quantity: number;
  salePriceEur: Prisma.Decimal | null;
  priceEur: Prisma.Decimal;
  qualityId: string | null;
  sector: string | null;
  sectorId: string | null;
  supplierName: string | null;
}

export interface RepackApplyResult {
  weightWarning: boolean;
  inputWeight: number;
  outputWeight: number;
  lossWeight: number;
  lotsCreated: number;
  costPerKgEur: number;
}

/**
 * Find-or-create сектора складу за назвою (стабільний ключ `code`). Повертає id.
 */
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

/**
 * Find-or-create постачальника за назвою (для рядка комплектації, коли обрано з
 * довідника або вписано вручну). Порожня назва → null. Повертає id або null.
 */
async function findOrCreateSupplier(
  tx: Prisma.TransactionClient,
  name: string | null | undefined,
): Promise<string | null> {
  const n = (name ?? "").trim();
  if (!n) return null;
  const existing = await tx.supplier.findFirst({
    where: { name: n },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.supplier.create({
    data: { name: n },
    select: { id: true },
  });
  return created.id;
}

/**
 * Проводить перепаковку повного циклу. Викликається з `postStockDoc` після того,
 * як документ переведено у `posted`. Кидає при помилці (виклик-код відкочує
 * статус). Ідемпотентність забезпечується `$transaction` (усе-або-нічого) +
 * delete-then-create CostMovement за реєстратором.
 */
export async function applyRepackFullCycle(
  repackId: string,
  toleranceKg: number,
  db: PrismaClient = prisma,
): Promise<RepackApplyResult> {
  const doc = await db.repacking.findUnique({
    where: { id: repackId },
    select: {
      id: true,
      code1C: true,
      docDate: true,
      items: {
        select: {
          id: true,
          role: true,
          productId: true,
          barcode: true,
          sourceLotId: true,
          weight: true,
          quantity: true,
          salePriceEur: true,
          priceEur: true,
          qualityId: true,
          sector: true,
          sectorId: true,
          supplierName: true,
        },
      },
    },
  });
  if (!doc) throw new Error("repack_not_found");

  const recorder = doc.code1C ?? doc.id;
  const disassembled = doc.items.filter((i) => i.role !== "assembled");
  const assembled = doc.items.filter((i) => i.role === "assembled");

  if (assembled.some((a) => !a.productId)) {
    throw new Error("assembled_item_without_product");
  }

  // 1. Резолв джерельних лотів (для пулу собівартості + фізичного списання).
  const resolved = await resolveSourceLots(db, disassembled);

  // Постачальник джерела успадковується на нові (зібрані) мішки — як у 1С
  // (Упаковка бере постачальника з Розпаковки), для звітів «продажі за
  // постачальниками». Беремо перший непорожній серед джерельних лотів.
  const sourceSupplierId =
    resolved.map((r) => r.supplierId).find(Boolean) ?? null;

  // 2. Резолв Product.code1C для рядків комплектації (для CostMovement).
  const productIds = [
    ...new Set(assembled.map((a) => a.productId).filter(Boolean) as string[]),
  ];
  const products = productIds.length
    ? await db.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, code1C: true },
      })
    : [];
  const code1CByProduct = new Map<string, string | null>();
  for (const p of products) code1CByProduct.set(p.id, p.code1C);

  // 3. Пре-генерація ШК для рядків без сканера (поза транзакцією — потребує
  //    читань; race-захист — unique на lots.barcode всередині tx).
  const genBarcodes = new Map<string, string>();
  const usedBarcodes = new Set<string>();
  for (const a of assembled) {
    const scanned = (a.barcode ?? "").trim();
    if (scanned) {
      usedBarcodes.add(scanned);
      continue;
    }
    let code = await generateLotBarcode(a.productId as string);
    while (usedBarcodes.has(code)) code = bumpBarcode(code);
    usedBarcodes.add(code);
    genBarcodes.set(a.id, code);
  }

  // 4. План собівартості / нових лотів (чистий core).
  const plan = buildRepackApply({
    recorder,
    occurredAt: doc.docDate,
    toleranceKg,
    sources: resolved.map((r) => ({
      weight: r.weight,
      purchasePriceEur: r.purchasePriceEur,
    })),
    assembled: assembled.map((a) => ({
      itemId: a.id,
      productId: a.productId,
      productCode1C: a.productId
        ? (code1CByProduct.get(a.productId) ?? null)
        : null,
      weight: a.weight,
      quantity: a.quantity,
      salePriceEur: a.salePriceEur != null ? Number(a.salePriceEur) : 0,
    })),
  });

  // 5. Транзакція: списання джерела + створення нових лотів + собівартість +
  //    підсумки ваги у шапку.
  await db.$transaction(async (tx) => {
    // 5a. Списання джерельних мішків.
    for (const src of resolved) {
      await tx.lot.update({
        where: { id: src.lotId },
        data: {
          status: "repacked_out",
          quantity: 0,
          reservedForClientId: null,
          reservedForName: null,
          reservedByUserId: null,
          reservedByName: null,
          reservedUntil: null,
        },
      });
      await tx.repackingItem.update({
        where: { id: src.itemId },
        data: { sourceLotId: src.lotId, sourcePrevStatus: src.prevStatus },
      });
    }

    // 5b. Створення нових мішків.
    const planByItem = new Map(plan.newLots.map((n) => [n.itemId, n]));
    let lotsCreated = 0;
    for (const a of assembled) {
      const np = planByItem.get(a.id);
      if (!np) continue;
      const barcode = (a.barcode ?? "").trim() || genBarcodes.get(a.id);
      if (!barcode) throw new Error("assembled_item_without_barcode");

      let sectorId = a.sectorId ?? null;
      let sectorName = a.sector ?? null;
      if (!sectorId && sectorName && sectorName.trim()) {
        sectorId = await findOrCreateSector(tx, sectorName.trim());
      } else if (sectorId && !sectorName) {
        const s = await tx.warehouseSector.findUnique({
          where: { id: sectorId },
          select: { name: true },
        });
        sectorName = s?.name ?? null;
      }

      // Постачальник рядка комплектації (з довідника/вручну) має пріоритет над
      // успадкованим з джерела.
      const rowSupplierId = await findOrCreateSupplier(tx, a.supplierName);

      const created = await tx.lot.create({
        data: {
          productId: a.productId as string,
          barcode,
          weight: a.weight,
          quantity: 1,
          status: "free",
          priceEur: np.salePriceEur,
          purchasePriceEur: np.costPerKgEur,
          arrivalDate: doc.docDate,
          sector: sectorName,
          supplierId: rowSupplierId ?? sourceSupplierId,
        },
        select: { id: true },
      });
      lotsCreated += 1;

      await tx.repackingItem.update({
        where: { id: a.id },
        data: {
          createdLotId: created.id,
          costPerKgEur: new Prisma.Decimal(np.costPerKgEur),
          sectorId,
          sector: sectorName,
        },
      });
    }

    // 5c. Регістр собівартості (delete-then-create за реєстратором).
    await tx.costMovement.deleteMany({ where: { recorderCode1C: recorder } });
    if (plan.costRows.length > 0) {
      await tx.costMovement.createMany({ data: plan.costRows });
    }

    // 5d. Підсумки ваги у шапку.
    await tx.repacking.update({
      where: { id: doc.id },
      data: {
        inputWeight: plan.inputWeight,
        outputWeight: plan.outputWeight,
        lossWeight: plan.lossWeight,
      },
    });

    return lotsCreated;
  });

  return {
    weightWarning: plan.weightWarning,
    inputWeight: plan.inputWeight,
    outputWeight: plan.outputWeight,
    lossWeight: plan.lossWeight,
    lotsCreated: plan.newLots.length,
    costPerKgEur: plan.costPerKgEur,
  };
}

interface ResolvedSource {
  itemId: string;
  lotId: string;
  prevStatus: string;
  weight: number;
  purchasePriceEur: number | null;
  supplierId: string | null;
}

/** Резолвить джерельні лоти за `sourceLotId` (пріоритет) або `barcode`. */
async function resolveSourceLots(
  db: PrismaClient,
  disassembled: LoadedRepackItem[],
): Promise<ResolvedSource[]> {
  const byId = disassembled
    .map((i) => i.sourceLotId)
    .filter(Boolean) as string[];
  const byBarcode = disassembled
    .filter((i) => !i.sourceLotId && i.barcode)
    .map((i) => i.barcode as string);
  if (byId.length === 0 && byBarcode.length === 0) return [];

  const lots = await db.lot.findMany({
    where: {
      OR: [
        byId.length ? { id: { in: byId } } : undefined,
        byBarcode.length ? { barcode: { in: byBarcode } } : undefined,
      ].filter(Boolean) as Prisma.LotWhereInput[],
    },
    select: {
      id: true,
      barcode: true,
      status: true,
      weight: true,
      purchasePriceEur: true,
      supplierId: true,
    },
  });
  const lotById = new Map(lots.map((l) => [l.id, l]));
  const lotByBarcode = new Map(lots.map((l) => [l.barcode, l]));

  const out: ResolvedSource[] = [];
  for (const item of disassembled) {
    const lot = item.sourceLotId
      ? lotById.get(item.sourceLotId)
      : item.barcode
        ? lotByBarcode.get(item.barcode)
        : undefined;
    if (!lot) continue; // джерело не знайдено — пропускаємо (best-effort)
    // Собівартість €/кг: з лота, а якщо його немає (старі 1С-лоти без ціни
    // закупівлі) — з ручного поля «Собівартість €/кг» рядка розбору.
    const manualCost = Number(item.priceEur);
    const purchasePriceEur =
      lot.purchasePriceEur ?? (manualCost > 0 ? manualCost : null);
    out.push({
      itemId: item.id,
      lotId: lot.id,
      prevStatus: lot.status,
      // Вага з рядка документа (комірник міг ввести фактичну), fallback — лот.
      weight: item.weight || lot.weight,
      purchasePriceEur,
      supplierId: lot.supplierId,
    });
  }
  return out;
}

/**
 * Реверс проведення (розпроведення / cancel): видаляє створені лоти,
 * відновлює джерельні (status = sourcePrevStatus ?? "free", quantity = 1),
 * прибирає CostMovement за реєстратором. Best-effort (не кидає).
 */
export function removeRepackFullCycle(
  repackId: string,
  db: PrismaClient = prisma,
): void {
  void (async () => {
    const doc = await db.repacking.findUnique({
      where: { id: repackId },
      select: {
        id: true,
        code1C: true,
        items: {
          select: {
            id: true,
            role: true,
            createdLotId: true,
            sourceLotId: true,
            sourcePrevStatus: true,
          },
        },
      },
    });
    if (!doc) return;
    const recorder = doc.code1C ?? doc.id;
    const createdLotIds = doc.items
      .map((i) => i.createdLotId)
      .filter(Boolean) as string[];
    const sources = doc.items.filter(
      (i) => i.role !== "assembled" && i.sourceLotId,
    );

    await db.$transaction(async (tx) => {
      for (const s of sources) {
        await tx.lot.update({
          where: { id: s.sourceLotId as string },
          data: { status: s.sourcePrevStatus ?? "free", quantity: 1 },
        });
      }
      if (createdLotIds.length) {
        await tx.lot.deleteMany({ where: { id: { in: createdLotIds } } });
      }
      await tx.costMovement.deleteMany({ where: { recorderCode1C: recorder } });
      await tx.repackingItem.updateMany({
        where: { repackingId: doc.id },
        data: {
          createdLotId: null,
          costPerKgEur: null,
          sourcePrevStatus: null,
        },
      });
    });
  })().catch((e: unknown) => {
    console.warn("[L-TEX] Failed to reverse repack full cycle", {
      repackId,
      error: e instanceof Error ? e.message : String(e),
    });
  });
}
