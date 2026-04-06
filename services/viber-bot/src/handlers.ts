import { prisma } from "@ltex/db";
import {
  QUALITY_LABELS,
  type QualityLevel,
  ORDER_STATUS_LABELS,
  type OrderStatus,
  CONTACTS,
  APP_NAME,
  CATEGORIES,
} from "@ltex/shared";
import {
  sendTextMessage,
  mainMenuKeyboard,
  qualityKeyboard,
  type ViberWebhookEvent,
  type ViberKeyboard,
} from "./viber";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua";

// ─── State: track users waiting for input ────────────────────────────────────

const pendingInput = new Map<string, "search" | "order">();

// ─── Event Router ────────────────────────────────────────────────────────────

export async function handleEvent(event: ViberWebhookEvent): Promise<void> {
  switch (event.event) {
    case "conversation_started":
      // First time user opens chat or clicks bot link
      if (event.user) {
        await handleStart(event.user.id, event.user.name);
      }
      break;

    case "subscribed":
      if (event.user) {
        await handleStart(event.user.id, event.user.name);
      }
      break;

    case "message":
      if (event.sender && event.message) {
        await handleMessage(event.sender.id, event.message.text ?? "");
      }
      break;

    default:
      // delivered, seen, failed — ignore silently
      break;
  }
}

// ─── Message Router ──────────────────────────────────────────────────────────

async function handleMessage(userId: string, text: string): Promise<void> {
  const trimmed = text.trim();

  // Check for menu button actions
  if (trimmed === "menu:main" || trimmed === "/start") return handleStart(userId);
  if (trimmed === "menu:search") return handleSearchPrompt(userId);
  if (trimmed === "menu:lots") return handleLots(userId, "");
  if (trimmed === "menu:categories") return handleCategories(userId);
  if (trimmed === "menu:order") return handleOrderPrompt(userId);
  if (trimmed === "menu:help") return handleHelp(userId);

  // Quality filter from keyboard
  if (trimmed.startsWith("lots:")) {
    const qualityKey = trimmed.replace("lots:", "");
    const label = QUALITY_LABELS[qualityKey as QualityLevel] ?? qualityKey;
    return handleLots(userId, label);
  }

  // Check if user is waiting for input
  const pending = pendingInput.get(userId);
  if (pending === "search") {
    pendingInput.delete(userId);
    return handleSearch(userId, trimmed);
  }
  if (pending === "order") {
    pendingInput.delete(userId);
    return handleOrder(userId, trimmed);
  }

  // Plain text → search
  if (trimmed.length >= 2) {
    return handleSearch(userId, trimmed);
  }

  await sendTextMessage(userId, "Оберіть дію з меню нижче або напишіть назву товару 🔍", mainMenuKeyboard());
}

// ─── /start (conversation_started + subscribed) ──────────────────────────────

async function handleStart(userId: string, userName?: string): Promise<void> {
  const greeting = userName ? `${userName}, в` : "В";
  const text = [
    `👋 ${greeting}ітаємо в ${APP_NAME}!`,
    ``,
    `Гуртовий продаж секонд хенду, стоку, іграшок та Bric-a-Brac від 10 кг.`,
    `Одяг, взуття, аксесуари з Англії, Німеччини, Канади, Польщі.`,
    ``,
    `Оберіть дію з меню нижче або просто напишіть назву товару для пошуку 🔍`,
  ].join("\n");

  await sendTextMessage(userId, text, mainMenuKeyboard());
}

// ─── Search prompt ───────────────────────────────────────────────────────────

async function handleSearchPrompt(userId: string): Promise<void> {
  pendingInput.set(userId, "search");
  await sendTextMessage(userId, "🔍 Введіть назву товару для пошуку:", {
    Type: "keyboard",
    DefaultHeight: false,
    BgColor: "#f5f5f5",
    Buttons: [
      {
        Columns: 6, Rows: 1,
        Text: "<font color=\"#999\">↩️ Головне меню</font>",
        ActionType: "reply",
        ActionBody: "menu:main",
        BgColor: "#f5f5f5",
        TextSize: "small",
        TextHAlign: "center",
        TextVAlign: "middle",
      },
    ],
  });
}

// ─── Search ──────────────────────────────────────────────────────────────────

async function handleSearch(userId: string, query: string): Promise<void> {
  if (!query || query.length < 2) {
    await sendTextMessage(userId, "Введіть запит для пошуку (мінімум 2 символи).", mainMenuKeyboard());
    return;
  }

  const products = await prisma.product.findMany({
    where: {
      inStock: true,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { articleCode: { contains: query, mode: "insensitive" } },
      ],
    },
    include: {
      prices: { where: { priceType: "wholesale" }, take: 1 },
      _count: { select: { lots: true } },
    },
    take: 10,
    orderBy: { updatedAt: "desc" },
  });

  if (products.length === 0) {
    await sendTextMessage(userId, `🔍 За запитом "${query}" нічого не знайдено.`, mainMenuKeyboard());
    return;
  }

  const lines = products.map((p, i) => {
    const price = p.prices[0]?.amount;
    const priceStr = price ? `€${price.toFixed(2)}/${p.priceUnit === "kg" ? "кг" : "шт"}` : "";
    const quality = QUALITY_LABELS[p.quality as QualityLevel] ?? p.quality;
    return `${i + 1}. ${p.name}\n   ${quality} • ${priceStr} • ${p._count.lots} лотів\n   ${SITE_URL}/product/${p.slug}`;
  });

  const text = [
    `🔍 Результати для "${query}" (${products.length}):`,
    ``,
    ...lines,
  ].join("\n");

  await sendTextMessage(userId, text, mainMenuKeyboard());
}

// ─── Lots ────────────────────────────────────────────────────────────────────

async function handleLots(userId: string, qualityFilter: string): Promise<void> {
  const where: { status: string; product?: { quality: string } } = { status: "free" };

  if (qualityFilter) {
    const qualityKey = Object.entries(QUALITY_LABELS).find(
      ([, label]) => label.toLowerCase() === qualityFilter.toLowerCase(),
    )?.[0];
    if (qualityKey) {
      where.product = { quality: qualityKey };
    }
  }

  const [lots, total] = await Promise.all([
    prisma.lot.findMany({
      where,
      include: { product: { select: { name: true, quality: true, priceUnit: true, slug: true } } },
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
    prisma.lot.count({ where }),
  ]);

  if (lots.length === 0) {
    await sendTextMessage(userId, "📦 Вільних лотів не знайдено.", qualityKeyboard());
    return;
  }

  const lines = lots.map((lot, i) => {
    const quality = QUALITY_LABELS[lot.product.quality as QualityLevel] ?? lot.product.quality;
    return `${i + 1}. ${lot.product.name}\n   ${quality} • ${lot.weight} кг • €${lot.priceEur.toFixed(2)}\n   Штрихкод: ${lot.barcode}`;
  });

  const text = [
    `📦 Вільні лоти${qualityFilter ? ` (${qualityFilter})` : ""}: ${total} шт`,
    total > 10 ? "(показано перші 10)" : "",
    ``,
    ...lines,
    ``,
    `Всі лоти: ${SITE_URL}/lots`,
  ]
    .filter(Boolean)
    .join("\n");

  await sendTextMessage(userId, text, qualityKeyboard());
}

// ─── Order prompt ────────────────────────────────────────────────────────────

async function handleOrderPrompt(userId: string): Promise<void> {
  pendingInput.set(userId, "order");
  await sendTextMessage(userId, "📋 Введіть ID або номер замовлення:", {
    Type: "keyboard",
    DefaultHeight: false,
    BgColor: "#f5f5f5",
    Buttons: [
      {
        Columns: 6, Rows: 1,
        Text: "<font color=\"#999\">↩️ Головне меню</font>",
        ActionType: "reply",
        ActionBody: "menu:main",
        BgColor: "#f5f5f5",
        TextSize: "small",
        TextHAlign: "center",
        TextVAlign: "middle",
      },
    ],
  });
}

// ─── Order ───────────────────────────────────────────────────────────────────

async function handleOrder(userId: string, orderId: string): Promise<void> {
  if (!orderId) {
    await sendTextMessage(userId, "Вкажіть ID замовлення.", mainMenuKeyboard());
    return;
  }

  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { id: { startsWith: orderId } },
        { code1C: orderId },
      ],
    },
    include: {
      customer: true,
      items: true,
    },
  });

  if (!order) {
    await sendTextMessage(userId, `❌ Замовлення "${orderId}" не знайдено.`, mainMenuKeyboard());
    return;
  }

  const productIds = [...new Set(order.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true },
  });
  const productNames = new Map(products.map((p) => [p.id, p.name]));

  const statusLabel = ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status;
  const itemLines = order.items.slice(0, 5).map(
    (item) => `  • ${productNames.get(item.productId) ?? "?"} — ${item.weight} кг, €${item.priceEur.toFixed(2)}`,
  );
  if (order.items.length > 5) {
    itemLines.push(`  ... та ще ${order.items.length - 5} позицій`);
  }

  const text = [
    `📋 Замовлення ${order.code1C ?? order.id.slice(0, 8)}`,
    ``,
    `Статус: ${statusLabel}`,
    `Клієнт: ${order.customer.name}`,
    `Сума: €${order.totalEur.toFixed(2)}`,
    order.totalUah > 0 ? `Сума (UAH): ${order.totalUah.toFixed(2)} ₴` : "",
    `Позицій: ${order.items.length}`,
    `Дата: ${new Date(order.createdAt).toLocaleDateString("uk-UA")}`,
    ``,
    `Товари:`,
    ...itemLines,
  ]
    .filter(Boolean)
    .join("\n");

  await sendTextMessage(userId, text, mainMenuKeyboard());
}

// ─── Categories ──────────────────────────────────────────────────────────────

async function handleCategories(userId: string): Promise<void> {
  const lines = CATEGORIES.map((cat) => {
    const subs = cat.subcategories.map((s) => s.name).join(", ");
    return `${cat.name}\n  ${subs}`;
  });

  const text = [
    `📂 Категорії товарів:`,
    ``,
    ...lines,
    ``,
    `Каталог: ${SITE_URL}/catalog`,
  ].join("\n");

  await sendTextMessage(userId, text, mainMenuKeyboard());
}

// ─── Help ────────────────────────────────────────────────────────────────────

async function handleHelp(userId: string): Promise<void> {
  const text = [
    `❓ Допомога ${APP_NAME} Bot`,
    ``,
    `Пошук товарів:`,
    `• Натисніть "🔍 Пошук" або просто напишіть назву`,
    ``,
    `Лоти (мішки):`,
    `• Натисніть "📦 Лоти" → оберіть якість`,
    ``,
    `Замовлення:`,
    `• Натисніть "📋 Замовлення" → введіть ID`,
    ``,
    `Категорії:`,
    `• Натисніть "📂 Категорії"`,
    ``,
    `Контакти:`,
    `📱 ${CONTACTS.phones.join(", ")}`,
    `📧 ${CONTACTS.email}`,
    `💬 Telegram: ${CONTACTS.telegram}`,
    `📍 ${CONTACTS.location}`,
  ].join("\n");

  await sendTextMessage(userId, text, mainMenuKeyboard());
}
