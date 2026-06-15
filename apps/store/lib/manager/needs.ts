import { prisma, type Prisma } from "@ltex/db";
import type { CurrentManager } from "@/lib/auth/manager-auth";
import { getMyClientCodes1C } from "@/lib/manager/order-ownership";
import { isActiveReservation } from "@/lib/manager/lot-booking";
import { getOrderStatusMeta } from "@/lib/manager/order-status";

/**
 * Блок «Потреби» (1С `Document.ОбщаяПотребність`) — on-the-fly агрегація
 * потреби (НЕ зберігається документ). Дзеркалить 3 вкладки 1С-форми:
 *
 *   • «Товари»         — Заказано / Остаток / Потрібно по номенклатурі;
 *   • «Замовлення»     — перелік замовлень-джерел потреби;
 *   • «Торгові агенти» — Заказано по (агент × номенклатура).
 *
 * Ключова формула 1С: **Количество = Заказано − Остаток** (чиста потреба).
 * Од. виміру: кг (вага) для kg-товарів, шт/пар (кількість) для
 * `Product.priceUnit != 'kg'` — рішення user.
 *
 * Остаток (вільний складський залишок) = Σ доступних ВІЛЬНИХ лотів
 * (`status='free'` без активної броні — предикат `isActiveReservation`).
 *
 * Джерело: лише АКТУАЛЬНІ замовлення
 * (`isActual=true AND archived=false AND closedAt IS NULL`).
 */

// ─── Типи рядків (узгоджені з 3 вкладками 1С) ──────────────────────────────

export type NeedUnit = "кг" | "шт" | "пар";

/** Рядок вкладки «Товари». */
export interface NeedRow {
  productId: string;
  articleCode: string;
  name: string;
  unit: NeedUnit;
  ordered: number;
  available: number;
  needed: number;
}

/** Рядок вкладки «Торгові агенти» (Остаток тут не враховується — як у 1С). */
export interface AgentNeedRow {
  agentKey: string;
  agentName: string;
  productId: string;
  name: string;
  unit: NeedUnit;
  ordered: number;
}

/** Рядок вкладки «Замовлення» (джерела потреби). */
export interface NeedOrderRow {
  orderId: string;
  orderNumber: string;
  customerName: string;
  city: string | null;
  agentName: string;
  status: string;
}

export interface NeedsResult {
  products: NeedRow[];
  byAgent: AgentNeedRow[];
  orders: NeedOrderRow[];
}

export interface NeedsFilters {
  clientId?: string;
  agentUserId?: string;
  city?: string;
  dateFrom?: Date;
  dateTo?: Date;
  /** Якщо `true` — вкладка «Товари» лишає тільки рядки з `needed > 0`. */
  deficitOnly?: boolean;
}

// ─── Одиниця виміру за priceUnit ───────────────────────────────────────────

/** Мапа `Product.priceUnit` → одиниця відображення. */
export function unitForPriceUnit(
  priceUnit: string | null | undefined,
): NeedUnit {
  switch (priceUnit) {
    case "piece":
      return "шт";
    case "pair":
      return "пар";
    case "kg":
    default:
      return "кг";
  }
}

/** Чи рахуємо цей товар по вазі (kg) — інакше по кількості (шт/пар). */
function isWeightProduct(priceUnit: string | null | undefined): boolean {
  return priceUnit !== "piece" && priceUnit !== "pair";
}

// ─── Чисті агрегатори (без I/O — окремо тестовані) ─────────────────────────

/** Мінімальний рядок замовлення для агрегації «Заказано». */
export interface OrderedItemInput {
  productId: string;
  weight: number;
  quantity: number;
}

/**
 * `Заказано` по товару серед переданих рядків замовлень.
 * kg-товар → Σ weight; шт/пар → Σ quantity. Групує по productId.
 * `priceUnitByProduct` — мапа productId → priceUnit для вибору метрики.
 */
export function aggregateOrdered(
  items: OrderedItemInput[],
  priceUnitByProduct: Map<string, string>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const it of items) {
    const useWeight = isWeightProduct(priceUnitByProduct.get(it.productId));
    const add = useWeight ? it.weight : it.quantity;
    out.set(it.productId, (out.get(it.productId) ?? 0) + (add || 0));
  }
  return out;
}

/** Мінімальний знімок лоту для агрегації «Остаток». */
export interface AvailableLotInput {
  productId: string;
  status: string;
  weight: number;
  quantity: number;
  reservedUntil: Date | null;
  reservedByUserId: string | null;
}

/**
 * `Остаток` (вільний складський залишок) по товару = Σ доступних вільних лотів.
 * Вільний = `status='free'` І немає активної броні (`isActiveReservation`).
 * kg-товар → Σ weight; шт/пар → Σ quantity. Групує по productId.
 */
export function aggregateAvailable(
  lots: AvailableLotInput[],
  priceUnitByProduct: Map<string, string>,
  now: Date = new Date(),
): Map<string, number> {
  const out = new Map<string, number>();
  for (const lot of lots) {
    if (lot.status !== "free") continue;
    if (isActiveReservation(lot, now)) continue;
    const useWeight = isWeightProduct(priceUnitByProduct.get(lot.productId));
    const add = useWeight ? lot.weight : lot.quantity;
    out.set(lot.productId, (out.get(lot.productId) ?? 0) + (add || 0));
  }
  return out;
}

/** Чиста потреба = max(0, Заказано − Остаток). */
export function computeNeeded(ordered: number, available: number): number {
  return Math.max(0, ordered - available);
}

// ─── Оркестратор (I/O) ─────────────────────────────────────────────────────

/**
 * Рахує потребу on-the-fly по актуальних замовленнях у скоупі викликача.
 * Ownership дзеркалить `orders-list.ts`: manager → лише свої клієнти
 * (за `customer.code1C ∈ getMyClientCodes1C`); admin/owner → усі.
 */
export async function computeNeeds(
  filters: NeedsFilters,
  viewer: Pick<CurrentManager, "id" | "role">,
  now: Date = new Date(),
): Promise<NeedsResult> {
  const empty: NeedsResult = { products: [], byAgent: [], orders: [] };

  // Скоуп видимості (manager → лише свої клієнти; admin → null = усі).
  const myCodes = await getMyClientCodes1C(viewer);
  if (myCodes !== null && myCodes.length === 0) return empty;

  const where: Prisma.OrderWhereInput = {
    isActual: true,
    archived: false,
    closedAt: null,
  };
  const customerWhere: Record<string, unknown> = {};
  if (myCodes !== null) customerWhere.code1C = { in: myCodes };
  if (filters.clientId) customerWhere.id = filters.clientId;
  if (filters.city) {
    customerWhere.city = { contains: filters.city, mode: "insensitive" };
  }
  if (Object.keys(customerWhere).length > 0) where.customer = customerWhere;

  if (filters.agentUserId) where.assignedAgentUserId = filters.agentUserId;

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }

  const orders = await prisma.order.findMany({
    where,
    select: {
      id: true,
      code1C: true,
      status: true,
      agentName: true,
      assignedAgentUserId: true,
      customer: { select: { name: true, city: true } },
      items: {
        select: { productId: true, weight: true, quantity: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (orders.length === 0) return empty;

  // `assignedAgentUserId` — плоский скаляр (без FK-relation на User), тож
  // резолвимо fullName агентів batch-lookup-ом.
  const agentUserIds = Array.from(
    new Set(
      orders
        .map((o) => o.assignedAgentUserId)
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const agentNameById = new Map<string, string>();
  if (agentUserIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: agentUserIds } },
      select: { id: true, fullName: true },
    });
    for (const u of users) agentNameById.set(u.id, u.fullName);
  }
  const resolveAgentName = (o: (typeof orders)[number]): string =>
    o.agentName ??
    (o.assignedAgentUserId
      ? agentNameById.get(o.assignedAgentUserId)
      : undefined) ??
    "—";

  // ── Вкладка «Замовлення» ──────────────────────────────────────────────
  const orderRows: NeedOrderRow[] = orders.map((o) => {
    const agentName = resolveAgentName(o);
    return {
      orderId: o.id,
      orderNumber: o.code1C ?? `№${o.id.slice(-6)}`,
      customerName: o.customer.name,
      city: o.customer.city,
      agentName,
      status: getOrderStatusMeta(o.status).label,
    };
  });

  // ── Зібрати productId-и → priceUnit + назва/артикул ──────────────────
  const allItems = orders.flatMap((o) =>
    o.items.map((i) => ({
      productId: i.productId,
      weight: i.weight,
      quantity: i.quantity,
    })),
  );
  const productIds = Array.from(new Set(allItems.map((i) => i.productId)));
  if (productIds.length === 0) {
    return { products: [], byAgent: [], orders: orderRows };
  }

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      name: true,
      articleCode: true,
      priceUnit: true,
      lots: {
        select: {
          productId: true,
          status: true,
          weight: true,
          quantity: true,
          reservedUntil: true,
          reservedByUserId: true,
        },
      },
    },
  });

  const priceUnitByProduct = new Map<string, string>();
  const nameByProduct = new Map<string, string>();
  const articleByProduct = new Map<string, string>();
  const allLots: AvailableLotInput[] = [];
  for (const p of products) {
    priceUnitByProduct.set(p.id, p.priceUnit);
    nameByProduct.set(p.id, p.name);
    articleByProduct.set(p.id, p.articleCode ?? "");
    for (const lot of p.lots) allLots.push(lot);
  }

  // ── Вкладка «Товари» ──────────────────────────────────────────────────
  const orderedByProduct = aggregateOrdered(allItems, priceUnitByProduct);
  const availableByProduct = aggregateAvailable(
    allLots,
    priceUnitByProduct,
    now,
  );

  let productRows: NeedRow[] = productIds.map((pid) => {
    const ordered = orderedByProduct.get(pid) ?? 0;
    const available = availableByProduct.get(pid) ?? 0;
    return {
      productId: pid,
      articleCode: articleByProduct.get(pid) ?? "",
      name: nameByProduct.get(pid) ?? "",
      unit: unitForPriceUnit(priceUnitByProduct.get(pid)),
      ordered,
      available,
      needed: computeNeeded(ordered, available),
    };
  });
  if (filters.deficitOnly !== false) {
    productRows = productRows.filter((r) => r.needed > 0);
  }
  productRows.sort((a, b) => b.needed - a.needed);

  // ── Вкладка «Торгові агенти» ──────────────────────────────────────────
  // Групуємо «Заказано» по (агент × товар). Агент — з замовлення.
  const agentMap = new Map<string, AgentNeedRow>();
  for (const o of orders) {
    const agentKey = o.assignedAgentUserId ?? o.agentName ?? "—";
    const agentName = resolveAgentName(o);
    for (const it of o.items) {
      const useWeight = isWeightProduct(priceUnitByProduct.get(it.productId));
      const add = (useWeight ? it.weight : it.quantity) || 0;
      const key = `${agentKey}|${it.productId}`;
      const existing = agentMap.get(key);
      if (existing) {
        existing.ordered += add;
      } else {
        agentMap.set(key, {
          agentKey,
          agentName,
          productId: it.productId,
          name: nameByProduct.get(it.productId) ?? "",
          unit: unitForPriceUnit(priceUnitByProduct.get(it.productId)),
          ordered: add,
        });
      }
    }
  }
  const agentRows = Array.from(agentMap.values()).sort(
    (a, b) =>
      a.agentName.localeCompare(b.agentName, "uk") || b.ordered - a.ordered,
  );

  return { products: productRows, byAgent: agentRows, orders: orderRows };
}
