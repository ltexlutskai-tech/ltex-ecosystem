import { Prisma, prisma } from "@ltex/db";
import { ownershipWhere } from "@/lib/manager/client-visibility";
import {
  buildColorWhere,
  computeClientColor,
  type ClientColor,
} from "@/lib/manager/client-color";
import { buildChatScopeWhere } from "@/lib/chat/conversation-access";
import type { CurrentManager } from "@/lib/auth/manager-auth";
import type { ClientListItem } from "../_components/types";

/**
 * ТЗ 8.0 B7: фільтр «активних» значень довідника для списків вибору —
 * приховує заархівовані та позначені на вилучення записи (вони лишаються у вже
 * збережених документах/клієнтах, але не пропонуються для нового вибору).
 */
const DICT_SELECT_WHERE = {
  archived: false,
  markedForDeletion: false,
} as const;

export interface LoadClientsParams {
  userId: string;
  /**
   * Роль поточного користувача. Manager-у завжди застосовується
   * ownership scope (тільки свої клієнти, незалежно від onlyMine URL-парам).
   * Admin бачить усіх; може опційно фільтрувати через `onlyMine`.
   * M1.3f.
   */
  userRole: CurrentManager["role"];
  // existing
  search?: string;
  status?: string; // legacy single code
  channel?: string;
  deliveryMethod?: string;
  hasDebt?: boolean;
  hasOverpayment?: boolean;
  onlyMine?: boolean;
  page: number;
  pageSize: number;
  hideTrash?: boolean;
  // Сортування по колонках
  sort?: string;
  dir?: "asc" | "desc";
  // M1.3e multi-select FK
  statusIds?: string[];
  statusOperationalIds?: string[];
  channelIds?: string[];
  deliveryMethodIds?: string[];
  categoryTTIds?: string[];
  priceTypeIds?: string[];
  primaryAssortmentIds?: string[];
  primaryRouteIds?: string[];
  agentUserIds?: string[];
  // Область/Місто — вільний текст (contains), як головний пошук.
  region?: string;
  city?: string;
  daysSinceMin?: number;
  daysSinceMax?: number;
  createdFrom?: Date;
  createdTo?: Date;
  // ── Блок «Список клієнтів» (2026-07-16): нові зрізи ──
  /** Пошук по історії роботи (timeline.body contains). Порт 1С `ФільтрИстория`. */
  historySearch?: string;
  /** Фільтр по ключових словах (тегах). Порт 1С `ФільтрКлючовіСлова`. */
  keywords?: string[];
  /** Режим збігу ключових слів: усі (AND) чи будь-яке (OR). Дефолт — AND. */
  keywordsMode?: "and" | "or";
  /** Пошук по асортименту клієнта (артикул/назва товару з реальних продажів). */
  assortmentSearch?: string;
  /** Мультивибір кольору-пріоритету (світлофор). */
  colors?: ClientColor[];
  /** Лише клієнти з активними (незавершеними) нагадуваннями. */
  hasReminder?: boolean;
  /** Лише клієнти з непрочитаними повідомленнями в месенджері. */
  hasUnreadMessage?: boolean;
}

/** Ключі сортування → Prisma orderBy. Дефолт — ім'я за зростанням. */
export function buildClientsOrderBy(
  sort: string | undefined,
  dir: "asc" | "desc",
): Prisma.MgrClientOrderByWithRelationInput {
  switch (sort) {
    case "phonePrimary":
      return { phonePrimary: dir };
    case "code1C":
      return { code1C: dir };
    case "tradePointName":
      return { tradePointName: dir };
    case "region":
      return { region: dir };
    case "city":
      return { city: dir };
    case "debt":
      return { debt: dir };
    case "overdueDebt":
      return { overdueDebt: dir };
    case "monthlyVolume":
      return { monthlyVolume: dir };
    case "daysSinceLast":
      return { daysSinceLastPurchase: dir };
    case "lastSyncedAt":
      return { lastSyncedAt: dir };
    case "createdAt":
      return { createdAt: dir };
    case "agent":
      return { agent: { fullName: dir } };
    case "name":
    default:
      return { name: dir };
  }
}

export interface LoadClientsResult {
  items: ClientListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function loadClients(
  p: LoadClientsParams,
): Promise<LoadClientsResult> {
  const andClauses: Prisma.MgrClientWhereInput[] = [];

  if (p.search) {
    andClauses.push({
      OR: [
        { name: { contains: p.search, mode: "insensitive" } },
        { phonePrimary: { contains: p.search } },
        { city: { contains: p.search, mode: "insensitive" } },
        { phones: { some: { phone: { contains: p.search } } } },
      ],
    });
  }

  // Пошук по історії роботи з клієнтом (порт 1С `ФільтрИстория`): звужуємо до
  // клієнтів, у чиїй історії взаємодій є запис із цим текстом.
  if (p.historySearch) {
    andClauses.push({
      timeline: {
        some: { body: { contains: p.historySearch, mode: "insensitive" } },
      },
    });
  }

  // Фільтр по ключових словах (тегах). AND — клієнт містить УСІ слова;
  // OR — містить будь-яке. Порт 1С `ФільтрКлючовіСлова` + тумблер «або».
  if (p.keywords && p.keywords.length > 0) {
    const perWord = p.keywords.map(
      (w): Prisma.MgrClientWhereInput => ({
        keywords: { contains: w, mode: "insensitive" },
      }),
    );
    andClauses.push(
      p.keywordsMode === "or" ? { OR: perWord } : { AND: perWord },
    );
  }

  if (p.statusIds && p.statusIds.length > 0) {
    andClauses.push({ statusGeneralId: { in: p.statusIds } });
  } else if (p.status) {
    andClauses.push({ statusGeneral: { code: p.status } });
  }

  if (p.channelIds && p.channelIds.length > 0) {
    andClauses.push({ searchChannelId: { in: p.channelIds } });
  } else if (p.channel) {
    andClauses.push({ searchChannel: { code: p.channel } });
  }

  if (p.deliveryMethodIds && p.deliveryMethodIds.length > 0) {
    andClauses.push({ deliveryMethodId: { in: p.deliveryMethodIds } });
  } else if (p.deliveryMethod) {
    andClauses.push({ deliveryMethod: { code: p.deliveryMethod } });
  }

  if (p.statusOperationalIds && p.statusOperationalIds.length > 0) {
    andClauses.push({ statusOperationalId: { in: p.statusOperationalIds } });
  }
  if (p.categoryTTIds && p.categoryTTIds.length > 0) {
    andClauses.push({ categoryTTId: { in: p.categoryTTIds } });
  }
  if (p.priceTypeIds && p.priceTypeIds.length > 0) {
    andClauses.push({ priceTypeId: { in: p.priceTypeIds } });
  }
  if (p.primaryAssortmentIds && p.primaryAssortmentIds.length > 0) {
    andClauses.push({ primaryAssortmentId: { in: p.primaryAssortmentIds } });
  }
  if (p.primaryRouteIds && p.primaryRouteIds.length > 0) {
    andClauses.push({ primaryRouteId: { in: p.primaryRouteIds } });
  }
  if (p.agentUserIds && p.agentUserIds.length > 0) {
    andClauses.push({ agentUserId: { in: p.agentUserIds } });
  }

  if (p.region) {
    andClauses.push({ region: { contains: p.region, mode: "insensitive" } });
  }
  if (p.city) {
    andClauses.push({ city: { contains: p.city, mode: "insensitive" } });
  }

  if (p.hasDebt) {
    andClauses.push({ debt: { gt: 0 } });
  } else if (p.hasOverpayment) {
    andClauses.push({ debt: { lt: 0 } });
  }

  // Лише клієнти з активними (незавершеними) нагадуваннями.
  if (p.hasReminder) {
    andClauses.push({ reminders: { some: { completedAt: null } } });
  }

  // Лише клієнти з непрочитаними повідомленнями в месенджері (у зоні доступу
  // менеджера — той самий chat-scope, що й у картці/inbox-і).
  if (p.hasUnreadMessage) {
    andClauses.push({
      chatConversations: {
        some: {
          unreadForManager: { gt: 0 },
          ...buildChatScopeWhere({ id: p.userId, role: p.userRole }),
        },
      },
    });
  }

  if (p.daysSinceMin !== undefined || p.daysSinceMax !== undefined) {
    const f: Prisma.IntNullableFilter = {};
    if (p.daysSinceMin !== undefined) f.gte = p.daysSinceMin;
    if (p.daysSinceMax !== undefined) f.lte = p.daysSinceMax;
    andClauses.push({ daysSinceLastPurchase: f });
  }

  if (p.createdFrom || p.createdTo) {
    const f: Prisma.DateTimeFilter = {};
    if (p.createdFrom) f.gte = p.createdFrom;
    if (p.createdTo) f.lte = p.createdTo;
    andClauses.push({ createdAt: f });
  }

  // `onlyMine` URL-toggle лише для admin-а. Менеджеру ownership scope
  // enforced серверно через `ownershipWhere` нижче (URL bypass-у нема).
  if (p.userRole === "admin" && p.onlyMine) {
    andClauses.push({
      OR: [
        { agentUserId: p.userId },
        { assignments: { some: { userId: p.userId } } },
      ],
    });
  }
  // ТЗ 8.0: замість старого хака з numeric-префіксами імен — справжня позначка
  // на вилучення. Позначені на вилучення ховаємо (за замовчуванням); архівні —
  // завжди поза робочим списком (окремий перегляд «Архів» — окремо).
  if (p.hideTrash !== false) {
    andClauses.push({ markedForDeletion: false });
  }
  andClauses.push({ archived: false });

  // M1.3f visibility scope. Admin → no filter; manager → лише свої.
  const ownership = ownershipWhere({ id: p.userId, role: p.userRole });
  if (Object.keys(ownership).length > 0) {
    andClauses.push(ownership);
  }

  const now = new Date();

  // Пошук по асортименту: резолвимо code1C клієнтів, які купували товар з таким
  // артикулом/назвою (з реальних продажів SaleItem), і фільтруємо по них.
  if (p.assortmentSearch) {
    const codes = await resolveAssortmentClientCodes(p.assortmentSearch);
    // Порожній результат → жоден клієнт не підходить.
    andClauses.push({ code1C: { in: codes } });
  }

  // Фільтр по кольору-пріоритету (світлофор). Якщо серед обраних є 🟢 «в роботі»
  // — резолвимо усі code1C з активними замовленнями (осі незалежні; recency-
  // бакети рахуються на боці БД через relation-фільтр timeline).
  if (p.colors && p.colors.length > 0) {
    const activeCodes = p.colors.includes("green")
      ? await resolveActiveOrderCodes()
      : [];
    const colorWhere = buildColorWhere(p.colors, activeCodes, now);
    if (colorWhere) andClauses.push(colorWhere);
  }

  const where: Prisma.MgrClientWhereInput =
    andClauses.length > 0 ? { AND: andClauses } : {};

  const [total, rows] = await Promise.all([
    prisma.mgrClient.count({ where }),
    prisma.mgrClient.findMany({
      where,
      orderBy: buildClientsOrderBy(p.sort, p.dir ?? "asc"),
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      include: {
        statusGeneral: true,
        statusOperational: true,
        searchChannel: true,
        deliveryMethod: true,
        categoryTT: true,
        priceType: true,
        primaryAssortment: true,
        primaryRoute: true,
        agent: { select: { id: true, fullName: true } },
        assignments: {
          include: { user: { select: { id: true, fullName: true } } },
        },
      },
    }),
  ]);

  // ── Світлофор пріоритету для показаних рядків ──
  // Остання взаємодія (max timeline.occurredAt) по клієнтах сторінки + набір
  // code1C з активними замовленнями (лише серед code1C сторінки — дешево).
  const pageClientIds = rows.map((r) => r.id);
  const pageCodes = rows
    .map((r) => r.code1C)
    .filter((c): c is string => Boolean(c));

  const [lastContactRows, activePageCodesArr, customerMirrorRows, unreadRows] =
    await Promise.all([
      pageClientIds.length > 0
        ? prisma.mgrClientTimelineEntry.groupBy({
            by: ["clientId"],
            where: { clientId: { in: pageClientIds } },
            _max: { occurredAt: true },
          })
        : Promise.resolve([]),
      pageCodes.length > 0
        ? resolveActiveOrderCodes(pageCodes)
        : Promise.resolve([]),
      // Дзеркало Customer.id по code1C — для дій контекстного меню
      // (Створити замовлення/реалізацію). Один батч на сторінку.
      pageCodes.length > 0
        ? prisma.customer.findMany({
            where: { code1C: { in: pageCodes } },
            select: { id: true, code1C: true },
          })
        : Promise.resolve([]),
      // Непрочитані повідомлення месенджера по клієнтах сторінки (один батч,
      // у зоні доступу менеджера — той самий chat-scope, що й у картці/inbox-і).
      pageClientIds.length > 0
        ? prisma.chatConversation.groupBy({
            by: ["clientId"],
            where: {
              clientId: { in: pageClientIds },
              unreadForManager: { gt: 0 },
              ...buildChatScopeWhere({ id: p.userId, role: p.userRole }),
            },
            _sum: { unreadForManager: true },
          })
        : Promise.resolve([]),
    ]);

  const lastContactMap = new Map<string, Date>();
  for (const g of lastContactRows) {
    if (g._max.occurredAt) lastContactMap.set(g.clientId, g._max.occurredAt);
  }
  const activePageCodes = new Set(activePageCodesArr);
  const customerIdByCode = new Map<string, string>();
  for (const cu of customerMirrorRows) {
    if (cu.code1C) customerIdByCode.set(cu.code1C, cu.id);
  }
  const unreadByClient = new Map<string, number>();
  for (const g of unreadRows) {
    if (g.clientId) {
      unreadByClient.set(g.clientId, g._sum.unreadForManager ?? 0);
    }
  }

  return {
    items: rows.map((c) => ({
      id: c.id,
      code1C: c.code1C,
      customerId: c.code1C ? (customerIdByCode.get(c.code1C) ?? null) : null,
      name: c.name,
      tradePointName: c.tradePointName,
      phonePrimary: c.phonePrimary,
      city: c.city,
      region: c.region,
      debt: c.debt.toString(),
      overdueDebt: c.overdueDebt.toString(),
      monthlyVolume: c.monthlyVolume?.toString() ?? null,
      daysSinceLastPurchase: c.daysSinceLastPurchase,
      lastPurchaseAt: c.lastPurchaseAt?.toISOString() ?? null,
      keywords: c.keywords,
      licenseExpiresAt: c.licenseExpiresAt?.toISOString() ?? null,
      lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      statusGeneral: c.statusGeneral
        ? {
            code: c.statusGeneral.code,
            label: c.statusGeneral.label,
            colorHex: c.statusGeneral.colorHex,
          }
        : null,
      statusOperational: c.statusOperational
        ? {
            code: c.statusOperational.code,
            label: c.statusOperational.label,
            colorHex: c.statusOperational.colorHex,
          }
        : null,
      searchChannel: c.searchChannel
        ? { code: c.searchChannel.code, label: c.searchChannel.label }
        : null,
      deliveryMethod: c.deliveryMethod
        ? { code: c.deliveryMethod.code, label: c.deliveryMethod.label }
        : null,
      categoryTT: c.categoryTT
        ? { code: c.categoryTT.code, label: c.categoryTT.label }
        : null,
      priceType: c.priceType
        ? { code: c.priceType.code, label: c.priceType.label }
        : null,
      primaryAssortment: c.primaryAssortment
        ? {
            code: c.primaryAssortment.code,
            label: c.primaryAssortment.label,
          }
        : null,
      primaryRoute: c.primaryRoute
        ? {
            code: c.primaryRoute.code1C ?? c.primaryRoute.id,
            label: c.primaryRoute.name,
          }
        : null,
      agent: c.agent ? { id: c.agent.id, fullName: c.agent.fullName } : null,
      assignedManager: c.assignments[0]?.user
        ? {
            id: c.assignments[0].user.id,
            fullName: c.assignments[0].user.fullName,
          }
        : null,
      color: computeClientColor({
        hasActiveOrder: c.code1C ? activePageCodes.has(c.code1C) : false,
        lastContactAt: lastContactMap.get(c.id) ?? null,
        now,
      }),
      lastContactAt: (lastContactMap.get(c.id) ?? null)?.toISOString() ?? null,
      unreadMessageCount: unreadByClient.get(c.id) ?? 0,
      // Є легасі «№ відділення НП», але структуровану адресу ще не звірено.
      npNotMatched:
        Boolean(c.novaPoshtaBranch?.trim()) && c.npAddressMatchedAt == null,
    })),
    total,
    page: p.page,
    pageSize: p.pageSize,
    totalPages: Math.max(1, Math.ceil(total / p.pageSize)),
  };
}

/**
 * Резолвить набір `code1C` клієнтів, які реально купували товар, що збігається
 * (contains, insensitive) за артикулом або назвою. Джерело — продажі (SaleItem).
 * `distinct` по customerId; take-cap як запобіжник.
 */
async function resolveAssortmentClientCodes(term: string): Promise<string[]> {
  const sales = await prisma.sale.findMany({
    where: {
      customer: { code1C: { not: null } },
      items: {
        some: {
          product: {
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { articleCode: { contains: term, mode: "insensitive" } },
            ],
          },
        },
      },
    },
    select: { customer: { select: { code1C: true } } },
    distinct: ["customerId"],
    take: 20_000,
  });
  const set = new Set<string>();
  for (const s of sales) {
    const code = s.customer?.code1C;
    if (code) set.add(code);
  }
  return Array.from(set);
}

/**
 * Резолвить набір `code1C` клієнтів з активними замовленнями (1С «Контрагенти з
 * актуальними замовленнями» → 🟢 у світлофорі). Активне = isActual && !archived
 * && !closed && !markedForDeletion. `limitToCodes` звужує до потрібних (для
 * розмальовки сторінки); без нього — усі (для фільтра по кольору green).
 */
async function resolveActiveOrderCodes(
  limitToCodes?: string[],
): Promise<string[]> {
  const orders = await prisma.order.findMany({
    where: {
      isActual: true,
      archived: false,
      closedAt: null,
      markedForDeletion: false,
      customer: limitToCodes
        ? { code1C: { in: limitToCodes } }
        : { code1C: { not: null } },
    },
    select: { customer: { select: { code1C: true } } },
    distinct: ["customerId"],
    take: 20_000,
  });
  const set = new Set<string>();
  for (const o of orders) {
    const code = o.customer?.code1C;
    if (code) set.add(code);
  }
  return Array.from(set);
}

/**
 * Усі унікальні теги (ключові слова) в системі — для автокомпліту у полі
 * «Ключові слова». keywords зберігаються як рядок через кому на MgrClient.
 */
export async function loadAllTags(): Promise<string[]> {
  const rows = await prisma.mgrClient.findMany({
    where: { keywords: { not: null }, archived: false },
    select: { keywords: true },
  });
  const set = new Set<string>();
  for (const r of rows) {
    for (const t of (r.keywords ?? "").split(",")) {
      const v = t.trim();
      if (v) set.add(v);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "uk"));
}

/**
 * Кількість активних (незавершених) нагадувань у зоні видимості користувача
 * (для бейджа на кнопці «Є нагадування»). Manager → лише по своїх клієнтах.
 */
export async function countOpenReminders(
  userId: string,
  userRole: CurrentManager["role"],
): Promise<number> {
  const ownership = ownershipWhere({ id: userId, role: userRole });
  return prisma.mgrReminder.count({
    where: {
      completedAt: null,
      client: Object.keys(ownership).length > 0 ? ownership : { isNot: null },
    },
  });
}

/**
 * Прибирає дублікати статусів за назвою у випадаючих списках. Дублікати
 * зʼявились через два seed-скрипти (тестові словесні коди vs справжні 9-значні
 * 1С-коди). Залишаємо ОДИН запис на назву, віддаючи перевагу канонічному
 * 9-значному коду (саме його ставить авто-статус). Порядок — за sortOrder
 * (порядок вхідного масиву).
 */
export function dedupeByLabelPreferCanonical<
  T extends { code: string; label: string },
>(rows: T[]): T[] {
  const byLabel = new Map<string, T>();
  for (const r of rows) {
    const key = r.label.trim().toLocaleLowerCase();
    const existing = byLabel.get(key);
    if (!existing) {
      byLabel.set(key, r);
      continue;
    }
    // Канонічний = 9-значний числовий 1С-код.
    if (/^\d{9}$/.test(r.code) && !/^\d{9}$/.test(existing.code)) {
      byLabel.set(key, r);
    }
  }
  return Array.from(byLabel.values());
}

export async function loadDictionariesSnapshot() {
  const [
    statuses,
    statusesOperational,
    channels,
    deliveries,
    categoriesTT,
    priceTypes,
    assortmentCodes,
    routes,
    agents,
    regionRows,
    cityRows,
  ] = await Promise.all([
    // ТЗ 8.0 B7: у списках вибору не показуємо заархівовані / позначені
    // на вилучення значення довідників.
    prisma.mgrClientStatus.findMany({
      where: DICT_SELECT_WHERE,
      orderBy: { sortOrder: "asc" },
    }),
    prisma.mgrClientStatus.findMany({
      where: DICT_SELECT_WHERE,
      orderBy: { sortOrder: "asc" },
    }),
    prisma.mgrSearchChannel.findMany({
      where: DICT_SELECT_WHERE,
      orderBy: { sortOrder: "asc" },
    }),
    prisma.mgrDeliveryMethod.findMany({
      where: DICT_SELECT_WHERE,
      orderBy: { sortOrder: "asc" },
    }),
    prisma.mgrCategoryTT.findMany({
      where: DICT_SELECT_WHERE,
      orderBy: { sortOrder: "asc" },
    }),
    prisma.mgrPriceType.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrAssortmentCode.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.mgrRoute.findMany({
      where: DICT_SELECT_WHERE,
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: { in: ["manager", "admin"] }, isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true },
    }),
    // Довідники Область/Місто — distinct значення з клієнтів (для фільтрів).
    prisma.mgrClient.findMany({
      where: { region: { not: null }, archived: false },
      distinct: ["region"],
      select: { region: true },
      orderBy: { region: "asc" },
    }),
    prisma.mgrClient.findMany({
      where: { city: { not: null }, archived: false },
      distinct: ["city"],
      select: { city: true },
      orderBy: { city: "asc" },
    }),
  ]);

  return {
    statuses: dedupeByLabelPreferCanonical(
      statuses.map((s) => ({
        id: s.id,
        code: s.code,
        label: s.label,
        colorHex: s.colorHex,
      })),
    ),
    statusesOperational: dedupeByLabelPreferCanonical(
      statusesOperational.map((s) => ({
        id: s.id,
        code: s.code,
        label: s.label,
        colorHex: s.colorHex,
      })),
    ),
    channels: channels.map((c) => ({ id: c.id, code: c.code, label: c.label })),
    deliveries: deliveries.map((d) => ({
      id: d.id,
      code: d.code,
      label: d.label,
    })),
    categoriesTT: categoriesTT.map((c) => ({
      id: c.id,
      code: c.code,
      label: c.label,
    })),
    priceTypes: priceTypes.map((p) => ({
      id: p.id,
      code: p.code,
      label: p.label,
    })),
    assortmentCodes: assortmentCodes.map((a) => ({
      id: a.id,
      code: a.code,
      label: a.label,
    })),
    routes: routes.map((r) => ({ id: r.id, name: r.name })),
    agents: agents.map((u) => ({ id: u.id, fullName: u.fullName })),
    regions: regionRows
      .map((r) => r.region)
      .filter((v): v is string => Boolean(v)),
    cities: cityRows.map((c) => c.city).filter((v): v is string => Boolean(v)),
  };
}
