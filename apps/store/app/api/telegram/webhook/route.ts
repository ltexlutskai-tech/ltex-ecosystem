import { NextRequest, NextResponse } from "next/server";
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

/**
 * Telegram Bot Webhook handler.
 *
 * Processes incoming Telegram updates (messages, callback queries, inline queries).
 * The bot token is verified via a secret path segment or header.
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua";

// ─── Telegram API helpers ────────────────────────────────────────────────────

async function apiCall(
  method: string,
  params: Record<string, unknown>,
): Promise<void> {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendMessage(
  chatId: number,
  text: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await apiCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });
}

// ─── Command handlers ────────────────────────────────────────────────────────

async function handleStart(chatId: number): Promise<void> {
  await sendMessage(
    chatId,
    [
      `👋 Вітаємо в <b>${escapeHtml(APP_NAME)}</b>!`,
      ``,
      `Гуртовий продаж секонд хенду, стоку, іграшок та Bric-a-Brac від 10 кг.`,
      ``,
      `<b>Команди:</b>`,
      `/search &lt;запит&gt; — пошук товарів`,
      `/lots — доступні лоти`,
      `/order &lt;ID&gt; — статус замовлення`,
      `/categories — категорії`,
      `/help — допомога`,
      ``,
      `Або просто напишіть назву товару 🔍`,
    ].join("\n"),
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🛍 Каталог", url: `${SITE_URL}/catalog` },
            { text: "📦 Лоти", url: `${SITE_URL}/lots` },
          ],
          [
            { text: "📞 Контакти", url: `${SITE_URL}/contacts` },
            {
              text: "💬 Telegram",
              url: `https://t.me/${CONTACTS.telegram.replace("@", "")}`,
            },
          ],
        ],
      },
    },
  );
}

async function handleSearch(chatId: number, query: string): Promise<void> {
  if (!query || query.length < 2) {
    await sendMessage(
      chatId,
      "Введіть запит (мін. 2 символи). Приклад: /search куртки",
    );
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
    await sendMessage(
      chatId,
      `🔍 За запитом "<b>${escapeHtml(query)}</b>" нічого не знайдено.`,
    );
    return;
  }

  const lines = products.map((p, i) => {
    const price = p.prices[0]?.amount;
    const priceStr = price
      ? `€${price.toFixed(2)}/${p.priceUnit === "kg" ? "кг" : "шт"}`
      : "";
    const quality = QUALITY_LABELS[p.quality as QualityLevel] ?? p.quality;
    return `${i + 1}. <b>${escapeHtml(p.name)}</b>\n   ${quality} • ${priceStr} • ${p._count.lots} лотів\n   <a href="${SITE_URL}/product/${p.slug}">→</a>`;
  });

  await sendMessage(
    chatId,
    [
      `🔍 "<b>${escapeHtml(query)}</b>" (${products.length}):`,
      ``,
      ...lines,
    ].join("\n"),
  );
}

async function handleLots(
  chatId: number,
  qualityFilter: string,
): Promise<void> {
  const where: Record<string, unknown> = { status: "free" };
  if (qualityFilter) {
    const key = Object.entries(QUALITY_LABELS).find(
      ([, label]) => label.toLowerCase() === qualityFilter.toLowerCase(),
    )?.[0];
    if (key) where.product = { quality: key };
  }

  const [lots, total] = await Promise.all([
    prisma.lot.findMany({
      where,
      include: {
        product: {
          select: { name: true, quality: true, priceUnit: true, slug: true },
        },
      },
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
    prisma.lot.count({ where }),
  ]);

  if (lots.length === 0) {
    await sendMessage(chatId, "📦 Вільних лотів не знайдено.");
    return;
  }

  const lines = lots.map((lot, i) => {
    const quality =
      QUALITY_LABELS[lot.product.quality as QualityLevel] ??
      lot.product.quality;
    return `${i + 1}. <b>${escapeHtml(lot.product.name)}</b>\n   ${quality} • ${lot.weight} кг • €${lot.priceEur.toFixed(2)}\n   <code>${lot.barcode}</code>`;
  });

  await sendMessage(
    chatId,
    [
      `📦 Вільні лоти${qualityFilter ? ` (${qualityFilter})` : ""}: ${total} шт`,
      total > 10 ? "(перші 10)" : "",
      ``,
      ...lines,
      ``,
      `<a href="${SITE_URL}/lots">Всі лоти →</a>`,
    ]
      .filter(Boolean)
      .join("\n"),
    {
      reply_markup: {
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
      },
    },
  );
}

async function handleOrder(chatId: number, orderId: string): Promise<void> {
  if (!orderId) {
    await sendMessage(chatId, "Вкажіть ID замовлення. Приклад: /order abc123");
    return;
  }

  const order = await prisma.order.findFirst({
    where: { OR: [{ id: { startsWith: orderId } }, { code1C: orderId }] },
    include: { customer: true, items: true },
  });

  if (!order) {
    await sendMessage(
      chatId,
      `❌ Замовлення "<b>${escapeHtml(orderId)}</b>" не знайдено.`,
    );
    return;
  }

  const productIds = [...new Set(order.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true },
  });
  const productNames = new Map(products.map((p) => [p.id, p.name]));

  const statusLabel =
    ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status;
  const itemLines = order.items
    .slice(0, 5)
    .map(
      (item) =>
        `  • ${escapeHtml(productNames.get(item.productId) ?? "?")} — ${item.weight} кг`,
    );
  if (order.items.length > 5)
    itemLines.push(`  ... +${order.items.length - 5}`);

  await sendMessage(
    chatId,
    [
      `📋 <b>Замовлення ${escapeHtml(order.code1C ?? order.id.slice(0, 8))}</b>`,
      ``,
      `Статус: <b>${statusLabel}</b>`,
      `Клієнт: ${escapeHtml(order.customer.name)}`,
      `Сума: €${order.totalEur.toFixed(2)}`,
      `Позицій: ${order.items.length}`,
      `Дата: ${new Date(order.createdAt).toLocaleDateString("uk-UA")}`,
      ``,
      ...itemLines,
    ].join("\n"),
  );
}

async function handleCategories(chatId: number): Promise<void> {
  const lines = CATEGORIES.map((cat) => {
    const subs = cat.subcategories.map((s) => s.name).join(", ");
    return `<b>${escapeHtml(cat.name)}</b>\n  ${subs}`;
  });
  await sendMessage(
    chatId,
    [
      `📂 <b>Категорії:</b>`,
      ``,
      ...lines,
      ``,
      `<a href="${SITE_URL}/catalog">Каталог →</a>`,
    ].join("\n"),
  );
}

// ─── Inline query handler ────────────────────────────────────────────────────

async function handleInlineQuery(inlineQuery: {
  id: string;
  query: string;
}): Promise<void> {
  const q = inlineQuery.query.trim();
  if (q.length < 2) {
    await apiCall("answerInlineQuery", {
      inline_query_id: inlineQuery.id,
      results: [],
      cache_time: 10,
    });
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
  });

  const results = products.map((p) => {
    const price = p.prices[0]?.amount;
    const quality = QUALITY_LABELS[p.quality as QualityLevel] ?? p.quality;
    const priceStr = price ? `€${price.toFixed(2)}` : "";
    return {
      type: "article",
      id: p.id,
      title: p.name,
      description: `${quality} • ${priceStr} • ${p._count.lots} лотів`,
      input_message_content: {
        message_text: `<b>${escapeHtml(p.name)}</b>\n${quality} • ${priceStr}\n<a href="${SITE_URL}/product/${p.slug}">Переглянути →</a>`,
        parse_mode: "HTML",
      },
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔗 На сайті", url: `${SITE_URL}/product/${p.slug}` }],
        ],
      },
    };
  });

  await apiCall("answerInlineQuery", {
    inline_query_id: inlineQuery.id,
    results,
    cache_time: 60,
  });
}

// ─── Webhook POST handler ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: "Bot not configured" }, { status: 503 });
  }

  // Require the webhook secret to be configured. Without it we cannot verify
  // that the request actually came from Telegram, so we refuse to process it.
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error("TELEGRAM_WEBHOOK_SECRET is not configured");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 503 },
    );
  }
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let update: Record<string, unknown>;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    // Route update to appropriate handler
    if (update.message) {
      const msg = update.message as { chat: { id: number }; text?: string };
      const chatId = msg.chat.id;
      const text = msg.text?.trim() ?? "";

      if (text.startsWith("/start")) await handleStart(chatId);
      else if (text.startsWith("/help"))
        await handleStart(chatId); // /help shows same welcome
      else if (text.startsWith("/search"))
        await handleSearch(chatId, text.replace("/search", "").trim());
      else if (text.startsWith("/lots"))
        await handleLots(chatId, text.replace("/lots", "").trim());
      else if (text.startsWith("/order"))
        await handleOrder(chatId, text.replace("/order", "").trim());
      else if (text.startsWith("/categories")) await handleCategories(chatId);
      else if (text.startsWith("/"))
        await sendMessage(chatId, "❓ Невідома команда. /help");
      else if (text.length >= 2) await handleSearch(chatId, text);
    }

    if (update.callback_query) {
      const cb = update.callback_query as {
        id: string;
        message?: { chat: { id: number } };
        data?: string;
      };
      if (cb.data?.startsWith("lots:") && cb.message) {
        const qualityKey = cb.data.replace("lots:", "");
        const label = QUALITY_LABELS[qualityKey as QualityLevel] ?? qualityKey;
        await apiCall("answerCallbackQuery", {
          callback_query_id: cb.id,
          text: `Лоти: ${label}`,
        });
        await handleLots(cb.message.chat.id, label);
      } else {
        await apiCall("answerCallbackQuery", { callback_query_id: cb.id });
      }
    }

    if (update.inline_query) {
      const iq = update.inline_query as { id: string; query: string };
      await handleInlineQuery(iq);
    }
  } catch (error) {
    console.error("Telegram webhook error:", error);
  }

  // Always return 200 to Telegram
  return NextResponse.json({ ok: true });
}
