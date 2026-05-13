#!/usr/bin/env tsx
/**
 * Seed script for Manager Clients (Session M1.3a).
 *
 * Створює 6 довідників + 10 фейкових клієнтів з timeline-записами.
 * Idempotent через upsert по `code`.
 *
 * Safeguard: якщо у `mgr_clients` уже є записи — нічого не робить.
 * Це захищає production від випадкового запуску після того як з'явиться
 * реальний SOAP-sync з 1С.
 *
 * Run: `pnpm --filter @ltex/store exec tsx scripts/seed-mgr-test-data.ts`
 */
import { prisma } from "@ltex/db";

const STATUSES = [
  { code: "active", label: "Активний", colorHex: "#16a34a", sortOrder: 1 },
  {
    code: "low_active",
    label: "Малоактивний",
    colorHex: "#eab308",
    sortOrder: 2,
  },
  { code: "inactive", label: "Неактивний", colorHex: "#dc2626", sortOrder: 3 },
  {
    code: "potential",
    label: "Потенційний",
    colorHex: "#3b82f6",
    sortOrder: 4,
  },
  { code: "new", label: "Новий", colorHex: "#a855f7", sortOrder: 5 },
];

const CHANNELS = [
  { code: "tiktok", label: "TikTok", sortOrder: 1 },
  { code: "google", label: "Google", sortOrder: 2 },
  { code: "olx", label: "OLX", sortOrder: 3 },
  { code: "viber_group", label: "Viber-група", sortOrder: 4 },
  { code: "base", label: "База", sortOrder: 5 },
  { code: "other", label: "Інше", sortOrder: 6 },
];

const CATEGORIES_TT = [
  { code: "shop", label: "Магазин", sortOrder: 1 },
  { code: "internet", label: "Інтернет-магазин", sortOrder: 2 },
  { code: "tiktok", label: "TikTok-канал", sortOrder: 3 },
];

const DELIVERIES = [
  { code: "nova_poshta", label: "Нова Пошта", sortOrder: 1 },
  { code: "delivery", label: "Доставка", sortOrder: 2 },
  { code: "pickup", label: "Самовивіз", sortOrder: 3 },
];

const ASSORTMENT_CODES = [
  { code: "second", label: "Секонд", sortOrder: 1 },
  { code: "stock", label: "Сток", sortOrder: 2 },
  { code: "second_stock", label: "Секонд / Сток", sortOrder: 3 },
  { code: "toys", label: "Іграшки", sortOrder: 4 },
  { code: "bric_a_brac", label: "Bric-a-Brac", sortOrder: 5 },
];

const ROUTES = [
  { code1C: "RT001", name: "Маршрут #1 — Захід" },
  { code1C: "RT002", name: "Маршрут #2 — Центр" },
  { code1C: "RT003", name: "Маршрут #3 — Південь" },
];

interface SeedClient {
  code1C: string;
  name: string;
  phonePrimary: string;
  city: string;
  region: string;
  street?: string;
  house?: string;
  novaPoshtaBranch?: string;
  monthlyVolume?: number;
  status: string;
  statusOperational?: string;
  channel: string;
  categoryTT?: string;
  deliveryMethod?: string;
  primaryAssortment?: string;
  primaryRoute?: string;
  debt: number;
  overdueDebt?: number;
  daysSinceLastPurchase: number | null;
  lastPurchaseDaysAgo: number | null;
  assignToAdmin?: boolean;
  timeline: Array<{
    kind: "payment" | "sale" | "reminder" | "comment";
    body: string;
    daysAgo: number;
  }>;
  assortment?: Array<{ productCode: string; productName: string }>;
  messengers?: Array<{ network: string; handle: string }>;
}

const CLIENTS: SeedClient[] = [
  {
    code1C: "000001234",
    name: "Амер",
    phonePrimary: "+380633669359",
    city: "Рівне",
    region: "Рівненська",
    street: "Соборна",
    house: "23",
    novaPoshtaBranch: "5",
    monthlyVolume: 120,
    status: "inactive",
    statusOperational: "low_active",
    channel: "base",
    categoryTT: "shop",
    deliveryMethod: "nova_poshta",
    primaryAssortment: "second_stock",
    primaryRoute: "RT001",
    debt: 17387.74,
    overdueDebt: 5200.0,
    daysSinceLastPurchase: 146,
    lastPurchaseDaysAgo: 146,
    assignToAdmin: true,
    timeline: [
      {
        kind: "payment",
        body: "Часткова оплата 4000 грн готівкою при відвантаженні",
        daysAgo: 146,
      },
      {
        kind: "sale",
        body: "Відвантажено 38 кг секонду · 12 070 грн",
        daysAgo: 147,
      },
      {
        kind: "comment",
        body: "Просив телефонувати по понеділках, у вихідні зайнятий",
        daysAgo: 60,
      },
    ],
    assortment: [
      { productCode: "C4C TT UK ORL", productName: "C4C TT UK Original" },
      { productCode: "D2D MIX EU", productName: "D2D MIX EU" },
    ],
    messengers: [
      { network: "viber", handle: "+380633669359" },
      { network: "tiktok", handle: "@amer_rivne" },
    ],
  },
  {
    code1C: "000001235",
    name: "Бєлоус Альона",
    phonePrimary: "+380505319881",
    city: "Дмитрівка",
    region: "Київська",
    monthlyVolume: 60,
    status: "active",
    statusOperational: "active",
    channel: "google",
    categoryTT: "internet",
    deliveryMethod: "nova_poshta",
    primaryAssortment: "second",
    primaryRoute: "RT002",
    debt: -8.23,
    daysSinceLastPurchase: 5,
    lastPurchaseDaysAgo: 5,
    assignToAdmin: true,
    timeline: [
      {
        kind: "payment",
        body: "Передоплата 3500 грн через Приват",
        daysAgo: 5,
      },
      { kind: "sale", body: "Відвантажено 22 кг сток", daysAgo: 6 },
    ],
    messengers: [{ network: "telegram", handle: "@bielous_alona" }],
  },
  {
    code1C: "000001236",
    name: "Гончарук Михайло",
    phonePrimary: "+380673334455",
    city: "Львів",
    region: "Львівська",
    status: "active",
    statusOperational: "active",
    channel: "tiktok",
    categoryTT: "tiktok",
    deliveryMethod: "delivery",
    primaryAssortment: "second_stock",
    primaryRoute: "RT001",
    debt: 0,
    daysSinceLastPurchase: 12,
    lastPurchaseDaysAgo: 12,
    timeline: [
      {
        kind: "sale",
        body: "Відвантажено 18 кг секонду · 5 940 грн",
        daysAgo: 12,
      },
      {
        kind: "payment",
        body: "Оплата готівкою при отриманні · 5 940 грн",
        daysAgo: 12,
      },
    ],
  },
  {
    code1C: "000001237",
    name: "Дудник Олена",
    phonePrimary: "+380502221122",
    city: "Одеса",
    region: "Одеська",
    status: "low_active",
    channel: "viber_group",
    categoryTT: "shop",
    deliveryMethod: "nova_poshta",
    primaryAssortment: "second",
    debt: 3200.5,
    daysSinceLastPurchase: 38,
    lastPurchaseDaysAgo: 38,
    timeline: [
      {
        kind: "reminder",
        body: "Передзвонити щодо погашення боргу до кінця місяця",
        daysAgo: 7,
      },
      {
        kind: "sale",
        body: "Відвантажено 25 кг секонду · 7 800 грн",
        daysAgo: 38,
      },
    ],
  },
  {
    code1C: "000001238",
    name: "Іваненко Петро",
    phonePrimary: "+380974445566",
    city: "Харків",
    region: "Харківська",
    status: "new",
    channel: "olx",
    deliveryMethod: "nova_poshta",
    primaryAssortment: "stock",
    debt: 0,
    daysSinceLastPurchase: null,
    lastPurchaseDaysAgo: null,
    timeline: [
      {
        kind: "comment",
        body: "Новий клієнт з OLX. Цікавиться сток одягом для дітей.",
        daysAgo: 1,
      },
    ],
  },
  {
    code1C: "000001239",
    name: "Кравчук Тетяна",
    phonePrimary: "+380677778899",
    city: "Тернопіль",
    region: "Тернопільська",
    status: "active",
    statusOperational: "active",
    channel: "base",
    categoryTT: "shop",
    deliveryMethod: "pickup",
    primaryAssortment: "second_stock",
    primaryRoute: "RT001",
    debt: -150.0,
    daysSinceLastPurchase: 3,
    lastPurchaseDaysAgo: 3,
    assignToAdmin: true,
    timeline: [
      {
        kind: "payment",
        body: "Переплата 150 грн — врахувати у наступному замовленні",
        daysAgo: 3,
      },
      {
        kind: "sale",
        body: "Самовивіз · 30 кг секонду + 5 кг сток",
        daysAgo: 3,
      },
      {
        kind: "comment",
        body: "Постійний клієнт, забирає в середу по обіді",
        daysAgo: 30,
      },
    ],
  },
  {
    code1C: "000001240",
    name: "Лисенко Наталія",
    phonePrimary: "+380501234567",
    city: "Київ",
    region: "Київська",
    monthlyVolume: 200,
    status: "active",
    statusOperational: "active",
    channel: "google",
    categoryTT: "internet",
    deliveryMethod: "nova_poshta",
    primaryAssortment: "stock",
    primaryRoute: "RT002",
    debt: 12450.0,
    overdueDebt: 0,
    daysSinceLastPurchase: 7,
    lastPurchaseDaysAgo: 7,
    timeline: [
      {
        kind: "sale",
        body: "Відвантажено 45 кг сток · 14 850 грн",
        daysAgo: 7,
      },
      {
        kind: "payment",
        body: "Часткова оплата 2400 грн на Приват",
        daysAgo: 7,
      },
    ],
  },
  {
    code1C: "000001241",
    name: "Мельник Андрій",
    phonePrimary: "+380636667788",
    city: "Чернівці",
    region: "Чернівецька",
    status: "potential",
    channel: "tiktok",
    deliveryMethod: "nova_poshta",
    primaryAssortment: "bric_a_brac",
    debt: 0,
    daysSinceLastPurchase: null,
    lastPurchaseDaysAgo: null,
    timeline: [
      {
        kind: "comment",
        body: "Підписався у TikTok, ще не замовляв. Дзвонити через тиждень.",
        daysAgo: 2,
      },
    ],
  },
  {
    code1C: "000001242",
    name: "Ничипоренко Ольга",
    phonePrimary: "+380504445566",
    city: "Запоріжжя",
    region: "Запорізька",
    status: "inactive",
    channel: "olx",
    deliveryMethod: "nova_poshta",
    primaryAssortment: "second",
    debt: 8900.25,
    overdueDebt: 8900.25,
    daysSinceLastPurchase: 220,
    lastPurchaseDaysAgo: 220,
    timeline: [
      {
        kind: "reminder",
        body: "Заблокована — не відповідає на дзвінки понад півроку",
        daysAgo: 30,
      },
      {
        kind: "sale",
        body: "Відвантажено 28 кг секонду · 8 900 грн",
        daysAgo: 220,
      },
    ],
  },
  {
    code1C: "000001243",
    name: "Остапчук Сергій",
    phonePrimary: "+380632223344",
    city: "Полтава",
    region: "Полтавська",
    status: "low_active",
    channel: "viber_group",
    categoryTT: "shop",
    deliveryMethod: "nova_poshta",
    primaryAssortment: "toys",
    primaryRoute: "RT003",
    debt: 0,
    daysSinceLastPurchase: 65,
    lastPurchaseDaysAgo: 65,
    timeline: [
      {
        kind: "sale",
        body: "Відвантажено 15 кг іграшок · 4 200 грн",
        daysAgo: 65,
      },
      {
        kind: "payment",
        body: "Оплата готівкою при отриманні",
        daysAgo: 65,
      },
    ],
  },
];

async function seedDictionaries() {
  for (const s of STATUSES) {
    await prisma.mgrClientStatus.upsert({
      where: { code: s.code },
      create: s,
      update: s,
    });
  }
  for (const c of CHANNELS) {
    await prisma.mgrSearchChannel.upsert({
      where: { code: c.code },
      create: c,
      update: c,
    });
  }
  for (const c of CATEGORIES_TT) {
    await prisma.mgrCategoryTT.upsert({
      where: { code: c.code },
      create: c,
      update: c,
    });
  }
  for (const d of DELIVERIES) {
    await prisma.mgrDeliveryMethod.upsert({
      where: { code: d.code },
      create: d,
      update: d,
    });
  }
  for (const a of ASSORTMENT_CODES) {
    await prisma.mgrAssortmentCode.upsert({
      where: { code: a.code },
      create: a,
      update: a,
    });
  }
  for (const r of ROUTES) {
    await prisma.mgrRoute.upsert({
      where: { code1C: r.code1C },
      create: r,
      update: { name: r.name },
    });
  }
  console.log("✓ Dictionaries seeded");
}

interface DictMaps {
  status: Map<string, string>;
  channel: Map<string, string>;
  categoryTT: Map<string, string>;
  deliveryMethod: Map<string, string>;
  assortment: Map<string, string>;
  route: Map<string, string>;
}

async function loadDictMaps(): Promise<DictMaps> {
  const [statuses, channels, categories, deliveries, assortment, routes] =
    await Promise.all([
      prisma.mgrClientStatus.findMany(),
      prisma.mgrSearchChannel.findMany(),
      prisma.mgrCategoryTT.findMany(),
      prisma.mgrDeliveryMethod.findMany(),
      prisma.mgrAssortmentCode.findMany(),
      prisma.mgrRoute.findMany(),
    ]);
  return {
    status: new Map(statuses.map((s) => [s.code, s.id])),
    channel: new Map(channels.map((c) => [c.code, c.id])),
    categoryTT: new Map(categories.map((c) => [c.code, c.id])),
    deliveryMethod: new Map(deliveries.map((d) => [d.code, d.id])),
    assortment: new Map(assortment.map((a) => [a.code, a.id])),
    route: new Map(
      routes.flatMap((r) => (r.code1C ? [[r.code1C, r.id] as const] : [])),
    ),
  };
}

function dayOffset(days: number | null): Date | null {
  if (days == null) return null;
  return new Date(Date.now() - days * 86400_000);
}

async function seedClients(maps: DictMaps) {
  const adminUser = await prisma.user.findFirst({ where: { role: "admin" } });

  for (const c of CLIENTS) {
    const created = await prisma.mgrClient.create({
      data: {
        code1C: c.code1C,
        name: c.name,
        phonePrimary: c.phonePrimary,
        city: c.city,
        region: c.region,
        street: c.street ?? null,
        house: c.house ?? null,
        novaPoshtaBranch: c.novaPoshtaBranch ?? null,
        monthlyVolume: c.monthlyVolume ?? null,
        debt: c.debt,
        overdueDebt: c.overdueDebt ?? 0,
        daysSinceLastPurchase: c.daysSinceLastPurchase,
        lastPurchaseAt: dayOffset(c.lastPurchaseDaysAgo),
        statusGeneralId: maps.status.get(c.status) ?? null,
        statusOperationalId: c.statusOperational
          ? (maps.status.get(c.statusOperational) ?? null)
          : null,
        searchChannelId: maps.channel.get(c.channel) ?? null,
        categoryTTId: c.categoryTT
          ? (maps.categoryTT.get(c.categoryTT) ?? null)
          : null,
        deliveryMethodId: c.deliveryMethod
          ? (maps.deliveryMethod.get(c.deliveryMethod) ?? null)
          : null,
        primaryAssortmentId: c.primaryAssortment
          ? (maps.assortment.get(c.primaryAssortment) ?? null)
          : null,
        primaryRouteId: c.primaryRoute
          ? (maps.route.get(c.primaryRoute) ?? null)
          : null,
        lastSyncedAt: new Date(),
      },
    });

    if (c.timeline.length > 0) {
      await prisma.mgrClientTimelineEntry.createMany({
        data: c.timeline.map((t) => ({
          clientId: created.id,
          kind: t.kind,
          body: t.body,
          occurredAt: new Date(Date.now() - t.daysAgo * 86400_000),
        })),
      });
    }

    if (c.assortment && c.assortment.length > 0) {
      await prisma.mgrClientAssortmentItem.createMany({
        data: c.assortment.map((a) => ({
          clientId: created.id,
          productCode: a.productCode,
          productName: a.productName,
          lastOrderedAt: dayOffset(c.lastPurchaseDaysAgo),
        })),
      });
    }

    if (c.messengers && c.messengers.length > 0) {
      await prisma.mgrClientMessenger.createMany({
        data: c.messengers.map((m) => ({
          clientId: created.id,
          network: m.network,
          handle: m.handle,
        })),
      });
    }

    if (c.primaryRoute) {
      const routeId = maps.route.get(c.primaryRoute);
      if (routeId) {
        await prisma.mgrClientRouteAssignment.create({
          data: { clientId: created.id, routeId },
        });
      }
    }

    if (c.assignToAdmin && adminUser) {
      await prisma.clientAssignment.create({
        data: { userId: adminUser.id, customerId: created.id },
      });
    }
  }

  console.log(`✓ Seeded ${CLIENTS.length} clients`);
}

async function main() {
  const existing = await prisma.mgrClient.count();
  if (existing > 0) {
    console.log(
      `⚠ mgr_clients already has ${existing} rows — пропускаю seed (захист від overwrite production).`,
    );
    return;
  }
  await seedDictionaries();
  const maps = await loadDictMaps();
  await seedClients(maps);
  console.log("✓ Seed complete");
}

main()
  .catch((e) => {
    console.error("[seed-mgr-test-data] failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
