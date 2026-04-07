import { prisma } from "@ltex/db";
import {
  QUALITY_LABELS,
  type QualityLevel,
  LOT_STATUS_LABELS,
  type LotStatus,
  ORDER_STATUS_LABELS,
  type OrderStatus,
  CONTACTS,
  APP_NAME,
  CATEGORIES,
} from "@ltex/shared";
import {
  sendMessage,
  answerCallbackQuery,
  answerInlineQuery,
  escapeHtml,
  type TelegramMessage,
  type CallbackQuery,
  type InlineQuery,
  type InlineQueryResult,
  type InlineKeyboardMarkup,
} from "./telegram";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua";

// Local types for Prisma query results (avoids implicit any from ungenerated client)
interface ProductSearchResult {
  id: string;
  name: string;
  slug: string;
  quality: string;
  priceUnit: string;
  prices: { amount: number }[];
  _count: { lots: number };
}

interface LotSearchResult {
  barcode: string;
  weight: number;
  priceEur: number;
  product: { name: string; quality: string; priceUnit: string; slug: string };
}

interface OrderResult {
  id: string;
  code1C: string | null;
  status: string;
  totalEur: number;
  totalUah: number;
  exchangeRate: number;
  createdAt: Date;
  customer: { name: string; phone: string | null };
  items: { productId: string; weight: number; priceEur: number }[];
}

// ─── Command Router ──────────────────────────────────────────────────────────

export async function handleMessage(message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const text = message.text?.trim() ?? "";

  if (text.startsWith("/start")) return handleStart(chatId);
  if (text.startsWith("/help")) return handleHelp(chatId);
  if (text.startsWith("/search")) return handleSearch(chatId, text.replace("/search", "").trim());
  if (text.startsWith("/lots")) return handleLots(chatId, text.replace("/lots", "").trim());
  if (text.startsWith("/order")) return handleOrder(chatId, text.replace("/order", "").trim());
  if (text.startsWith("/categories")) return handleCategories(chatId);
  if (text.startsWith("/")) return handleUnknown(chatId);

  // Plain text = search
  if (text.length >= 2) {
    return handleSearch(chatId, text);
  }
}

// ─── /start ──────────────────────────────────────────────────────────────────

async function handleStart(chatId: number): Promise<void> {
  const text = [
    `👋 Вітаємо в <b>${escapeHtml(APP_NAME)}</b>!`,
    ``,
    `Гуртовий продаж секонд хенду, стоку, іграшок та Bric-a-Brac від 10 кг.`,
    `Одяг, взуття, аксесуари з Англії, Німеччини, Канади, Польщі.`,
    ``,
    `<b>Команди:</b>`,
    `/search &lt;запит&gt; — пошук товарів`,
    `/lots — доступні лоти (мішки)`,
    `/order &lt;ID&gt; — статус замовлення`,
    `/categories — категорії товарів`,
    `/help — допомога`,
    ``,
    `Або просто напишіть назву товару для пошуку 🔍`,
  ].join("\n");

  await sendMessage(chatId, text, {
    replyMarkup: {
      inline_keyboard: [
        [
          { text: "🛍 Каталог", url: `${SITE_URL}/catalog` },
          { text: "📦 Лоти", url: `${SITE_URL}/lots` },
        ],
        [
          { text: "📞 Контакти", url: `${SITE_URL}/contacts` },
          { text: "💬 Telegram", url: `https://t.me/${CONTACTS.telegram.replace("@", "")}` },
        ],
      ],
    },
  });
}

// ─── /help ───────────────────────────────────────────────────────────────────

async function handleHelp(chatId: number): Promise<void> {
  const text = [
    `<b>Допомога ${escapeHtml(APP_NAME)} Bot</b>`,
    ``,
    `<b>Пошук товарів:</b>`,
    `• /search футболки — знайти товари по назві`,
    `• Або просто напишіть назву товару`,
    ``,
    `<b>Лоти (мішки):</b>`,
    `• /lots — всі вільні лоти`,
    `• /lots екстра — лоти конкретної якості`,
    ``,
    `<b>Замовлення:</b>`,
    `• /order abc123 — перевірити статус замовлення`,
    ``,
    `<b>Каталог:</b>`,
    `• /categories — список категорій`,
    ``,
    `<b>Контакти:</b>`,
    `📱 ${CONTACTS.phones.join(", ")}`,
    `📧 ${CONTACTS.email}`,
    `📍 ${CONTACTS.location}`,
  ].join("\n");

  await sendMessage(chatId, text);
}

// ─── /search ─────────────────────────────────────────────────────────────────

async function handleSearch(chatId: number, query: string): Promise<void> {
  if (!query || query.length < 2) {
    await sendMessage(chatId, "Введіть запит для пошуку (мінімум 2 символи).\nНаприклад: /search куртки");
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
    await sendMessage(chatId, `🔍 За запитом "<b>${escapeHtml(query)}</b>" нічого не знайдено.`);
    return;
  }

  const lines = (products as ProductSearchResult[]).map((p: ProductSearchResult, i: number) => {
    const price = p.prices[0]?.amount;
    const priceStr = price ? `€${price.toFixed(2)}/${p.priceUnit === "kg" ? "кг" : "шт"}` : "";
    const quality = QUALITY_LABELS[p.quality as QualityLevel] ?? p.quality;
    return [
      `${i + 1}. <b>${escapeHtml(p.name)}</b>`,
      `   ${quality} • ${priceStr} • ${p._count.lots} лотів`,
      `   <a href="${SITE_URL}/product/${p.slug}">Детальніше →</a>`,
    ].join("\n");
  });

  const text = [
    `🔍 Результати для "<b>${escapeHtml(query)}</b>" (${products.length}):`,
    ``,
    ...lines,
  ].join("\n");

  await sendMessage(chatId, text, { disableWebPagePreview: true });
}

// ─── /lots ───────────────────────────────────────────────────────────────────

async function handleLots(chatId: number, qualityFilter: string): Promise<void> {
  const where: { status: string; product?: { quality: string } } = { status: "free" };

  // Map Ukrainian quality name to key
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
    await sendMessage(chatId, "📦 Вільних лотів не знайдено.");
    return;
  }

  const lines = (lots as LotSearchResult[]).map((lot: LotSearchResult, i: number) => {
    const quality = QUALITY_LABELS[lot.product.quality as QualityLevel] ?? lot.product.quality;
    return [
      `${i + 1}. <b>${escapeHtml(lot.product.name)}</b>`,
      `   ${quality} • ${lot.weight} кг • €${lot.priceEur.toFixed(2)}`,
      `   Штрихкод: <code>${lot.barcode}</code>`,
    ].join("\n");
  });

  const text = [
    `📦 Вільні лоти${qualityFilter ? ` (${qualityFilter})` : ""}: ${total} шт`,
    total > 10 ? `(показано перші 10)` : "",
    ``,
    ...lines,
    ``,
    `<a href="${SITE_URL}/lots">Всі лоти на сайті →</a>`,
  ]
    .filter(Boolean)
    .join("\n");

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      Object.entries(QUALITY_LABELS)
        .slice(0, 3)
        .map(([key, label]) => ({
          text: label,
          callback_data: `lots:${key}`,
        })),
      Object.entries(QUALITY_LABELS)
        .slice(3)
        .map(([key, label]) => ({
          text: label,
          callback_data: `lots:${key}`,
        })),
    ],
  };

  await sendMessage(chatId, text, { replyMarkup: keyboard, disableWebPagePreview: true });
}

// ─── /order ──────────────────────────────────────────────────────────────────

async function handleOrder(chatId: number, orderId: string): Promise<void> {
  if (!orderId) {
    await sendMessage(chatId, "Вкажіть ID замовлення.\nНаприклад: /order abc123");
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
    await sendMessage(chatId, `❌ Замовлення "<b>${escapeHtml(orderId)}</b>" не знайдено.`);
    return;
  }

  // Fetch product names for items
  const typedOrder = order as unknown as OrderResult;
  const productIds = [...new Set(typedOrder.items.map((i: OrderResult["items"][number]) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true },
  });
  const productNames = new Map((products as { id: string; name: string }[]).map((p: { id: string; name: string }) => [p.id, p.name]));

  const statusLabel = ORDER_STATUS_LABELS[typedOrder.status as OrderStatus] ?? typedOrder.status;
  const itemLines = typedOrder.items.slice(0, 5).map(
    (item: OrderResult["items"][number]) => `  • ${escapeHtml(productNames.get(item.productId) ?? "?")} — ${item.weight} кг, €${item.priceEur.toFixed(2)}`,
  );
  if (typedOrder.items.length > 5) {
    itemLines.push(`  ... та ще ${typedOrder.items.length - 5} позицій`);
  }

  const text = [
    `📋 <b>Замовлення ${escapeHtml(typedOrder.code1C ?? typedOrder.id.slice(0, 8))}</b>`,
    ``,
    `<b>Статус:</b> ${statusLabel}`,
    `<b>Клієнт:</b> ${escapeHtml(typedOrder.customer.name)}`,
    `<b>Сума:</b> €${typedOrder.totalEur.toFixed(2)}`,
    typedOrder.totalUah > 0 ? `<b>Сума (UAH):</b> ${typedOrder.totalUah.toFixed(2)} ₴` : "",
    `<b>Позицій:</b> ${typedOrder.items.length}`,
    `<b>Дата:</b> ${new Date(typedOrder.createdAt).toLocaleDateString("uk-UA")}`,
    ``,
    `<b>Товари:</b>`,
    ...itemLines,
  ]
    .filter(Boolean)
    .join("\n");

  await sendMessage(chatId, text);
}

// ─── /categories ─────────────────────────────────────────────────────────────

async function handleCategories(chatId: number): Promise<void> {
  const lines = CATEGORIES.map((cat) => {
    const subs = cat.subcategories.map((s) => s.name).join(", ");
    return `<b>${escapeHtml(cat.name)}</b>\n  ${subs}`;
  });

  const text = [
    `📂 <b>Категорії товарів:</b>`,
    ``,
    ...lines,
    ``,
    `<a href="${SITE_URL}/catalog">Переглянути каталог →</a>`,
  ].join("\n");

  await sendMessage(chatId, text, { disableWebPagePreview: true });
}

// ─── Unknown command ─────────────────────────────────────────────────────────

async function handleUnknown(chatId: number): Promise<void> {
  await sendMessage(chatId, "❓ Невідома команда. Натисніть /help для списку команд.");
}

// ─── Callback Queries ────────────────────────────────────────────────────────

export async function handleCallbackQuery(query: CallbackQuery): Promise<void> {
  const chatId = query.message?.chat.id;
  if (!chatId || !query.data) {
    await answerCallbackQuery(query.id);
    return;
  }

  // lots:<quality>
  if (query.data.startsWith("lots:")) {
    const qualityKey = query.data.replace("lots:", "");
    const label = QUALITY_LABELS[qualityKey as QualityLevel] ?? qualityKey;
    await answerCallbackQuery(query.id, `Показую лоти: ${label}`);
    await handleLots(chatId, label);
    return;
  }

  await answerCallbackQuery(query.id);
}

// ─── Inline Query (for inline search) ────────────────────────────────────────

export async function handleInlineQuery(query: InlineQuery): Promise<void> {
  const q = query.query.trim();
  if (q.length < 2) {
    await answerInlineQuery(query.id, [], 10);
    return;
  }

  const products = await prisma.product.findMany({
    where: {
      inStock: true,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { articleCode: { contains: q, mode: "insensitive" } },
      ],
    },
    include: {
      prices: { where: { priceType: "wholesale" }, take: 1 },
      _count: { select: { lots: true } },
    },
    take: 10,
    orderBy: { updatedAt: "desc" },
  });

  const results: InlineQueryResult[] = (products as ProductSearchResult[]).map((p: ProductSearchResult) => {
    const price = p.prices[0]?.amount;
    const quality = QUALITY_LABELS[p.quality as QualityLevel] ?? p.quality;
    const priceStr = price ? `€${price.toFixed(2)}/${p.priceUnit === "kg" ? "кг" : "шт"}` : "";

    return {
      type: "article",
      id: p.id,
      title: p.name,
      description: `${quality} • ${priceStr} • ${p._count.lots} лотів`,
      input_message_content: {
        message_text: [
          `<b>${escapeHtml(p.name)}</b>`,
          `${quality} • ${priceStr}`,
          `Лотів: ${p._count.lots}`,
          ``,
          `<a href="${SITE_URL}/product/${p.slug}">Переглянути на сайті →</a>`,
        ].join("\n"),
        parse_mode: "HTML",
      },
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔗 Відкрити на сайті", url: `${SITE_URL}/product/${p.slug}` }],
        ],
      },
    };
  });

  await answerInlineQuery(query.id, results);
}
