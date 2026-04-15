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
import crypto from "crypto";

/**
 * Viber Bot Webhook handler.
 * Processes incoming Viber events (messages, subscriptions, conversation_started).
 *
 * Env vars:
 * - VIBER_AUTH_TOKEN — bot auth token
 * - NEXT_PUBLIC_SITE_URL — for product links
 */

const AUTH_TOKEN = process.env.VIBER_AUTH_TOKEN ?? "";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua";

// ─── Viber API ───────────────────────────────────────────────────────────────

async function sendMessage(
  receiverId: string,
  text: string,
  keyboard?: unknown,
): Promise<void> {
  await fetch("https://chatapi.viber.com/pa/send_message", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Viber-Auth-Token": AUTH_TOKEN,
    },
    body: JSON.stringify({
      receiver: receiverId,
      type: "text",
      text,
      keyboard,
      min_api_version: 7,
    }),
  });
}

function mainMenuKeyboard() {
  return {
    Type: "keyboard",
    DefaultHeight: false,
    BgColor: "#f5f5f5",
    Buttons: [
      {
        Columns: 3,
        Rows: 1,
        Text: '<font color="#fff"><b>🔍 Пошук</b></font>',
        ActionType: "reply",
        ActionBody: "menu:search",
        BgColor: "#16a34a",
        TextSize: "regular",
        TextHAlign: "center",
        TextVAlign: "middle",
      },
      {
        Columns: 3,
        Rows: 1,
        Text: '<font color="#fff"><b>📦 Лоти</b></font>',
        ActionType: "reply",
        ActionBody: "menu:lots",
        BgColor: "#2563eb",
        TextSize: "regular",
        TextHAlign: "center",
        TextVAlign: "middle",
      },
      {
        Columns: 3,
        Rows: 1,
        Text: '<font color="#fff"><b>📂 Категорії</b></font>',
        ActionType: "reply",
        ActionBody: "menu:categories",
        BgColor: "#7c3aed",
        TextSize: "regular",
        TextHAlign: "center",
        TextVAlign: "middle",
      },
      {
        Columns: 3,
        Rows: 1,
        Text: '<font color="#fff"><b>📋 Замовлення</b></font>',
        ActionType: "reply",
        ActionBody: "menu:order",
        BgColor: "#d97706",
        TextSize: "regular",
        TextHAlign: "center",
        TextVAlign: "middle",
      },
      {
        Columns: 3,
        Rows: 1,
        Text: '<font color="#16a34a"><b>🛍 Каталог</b></font>',
        ActionType: "open-url",
        ActionBody: `${SITE_URL}/catalog`,
        BgColor: "#e8f5e9",
        TextSize: "regular",
        TextHAlign: "center",
        TextVAlign: "middle",
      },
      {
        Columns: 3,
        Rows: 1,
        Text: '<font color="#333"><b>❓ Допомога</b></font>',
        ActionType: "reply",
        ActionBody: "menu:help",
        BgColor: "#e5e7eb",
        TextSize: "regular",
        TextHAlign: "center",
        TextVAlign: "middle",
      },
    ],
  };
}

function qualityKeyboard() {
  const labels: Record<string, string> = {
    extra: "Екстра",
    cream: "Крем",
    first: "1й сорт",
    second: "2й сорт",
    stock: "Сток",
    mix: "Мікс",
  };
  return {
    Type: "keyboard",
    DefaultHeight: false,
    BgColor: "#f5f5f5",
    Buttons: [
      ...Object.entries(labels).map(([key, label]) => ({
        Columns: 2,
        Rows: 1,
        Text: `<font color="#333"><b>${label}</b></font>`,
        ActionType: "reply",
        ActionBody: `lots:${key}`,
        BgColor: "#e5e7eb",
        TextSize: "regular",
        TextHAlign: "center",
        TextVAlign: "middle",
      })),
      {
        Columns: 6,
        Rows: 1,
        Text: '<font color="#999">↩️ Меню</font>',
        ActionType: "reply",
        ActionBody: "menu:main",
        BgColor: "#f5f5f5",
        TextSize: "small",
        TextHAlign: "center",
        TextVAlign: "middle",
      },
    ],
  };
}

// ─── Pending input state ─────────────────────────────────────────────────────
const pendingInput = new Map<string, "search" | "order">();

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleStart(userId: string, userName?: string): Promise<void> {
  const greeting = userName ? `${userName}, в` : "В";
  await sendMessage(
    userId,
    [
      `👋 ${greeting}ітаємо в ${APP_NAME}!`,
      ``,
      `Гуртовий продаж секонд хенду, стоку, іграшок та Bric-a-Brac від 10 кг.`,
      `Одяг, взуття, аксесуари з Англії, Німеччини, Канади, Польщі.`,
      ``,
      `Оберіть дію з меню або напишіть назву товару 🔍`,
    ].join("\n"),
    mainMenuKeyboard(),
  );
}

async function handleSearch(userId: string, query: string): Promise<void> {
  if (!query || query.length < 2) {
    await sendMessage(
      userId,
      "Введіть запит (мін. 2 символи).",
      mainMenuKeyboard(),
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
      userId,
      `🔍 За запитом "${query}" нічого не знайдено.`,
      mainMenuKeyboard(),
    );
    return;
  }

  const lines = products.map((p, i) => {
    const price = p.prices[0]?.amount;
    const priceStr = price
      ? `€${price.toFixed(2)}/${p.priceUnit === "kg" ? "кг" : "шт"}`
      : "";
    const quality = QUALITY_LABELS[p.quality as QualityLevel] ?? p.quality;
    return `${i + 1}. ${p.name}\n   ${quality} • ${priceStr} • ${p._count.lots} лотів\n   ${SITE_URL}/product/${p.slug}`;
  });

  await sendMessage(
    userId,
    [`🔍 "${query}" (${products.length}):`, ``, ...lines].join("\n"),
    mainMenuKeyboard(),
  );
}

async function handleLots(
  userId: string,
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
        product: { select: { name: true, quality: true, slug: true } },
      },
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
    prisma.lot.count({ where }),
  ]);

  if (lots.length === 0) {
    await sendMessage(
      userId,
      "📦 Вільних лотів не знайдено.",
      qualityKeyboard(),
    );
    return;
  }

  const lines = lots.map((lot, i) => {
    const quality =
      QUALITY_LABELS[lot.product.quality as QualityLevel] ??
      lot.product.quality;
    return `${i + 1}. ${lot.product.name}\n   ${quality} • ${lot.weight} кг • €${lot.priceEur.toFixed(2)}\n   ${lot.barcode}`;
  });

  await sendMessage(
    userId,
    [
      `📦 Лоти${qualityFilter ? ` (${qualityFilter})` : ""}: ${total} шт`,
      total > 10 ? "(перші 10)" : "",
      ``,
      ...lines,
      ``,
      `${SITE_URL}/lots`,
    ]
      .filter(Boolean)
      .join("\n"),
    qualityKeyboard(),
  );
}

async function handleOrder(userId: string, orderId: string): Promise<void> {
  if (!orderId) {
    await sendMessage(userId, "Вкажіть ID замовлення.", mainMenuKeyboard());
    return;
  }

  const order = await prisma.order.findFirst({
    where: { OR: [{ id: { startsWith: orderId } }, { code1C: orderId }] },
    include: { customer: true, items: true },
  });

  if (!order) {
    await sendMessage(
      userId,
      `❌ Замовлення "${orderId}" не знайдено.`,
      mainMenuKeyboard(),
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
        `  • ${productNames.get(item.productId) ?? "?"} — ${item.weight} кг`,
    );
  if (order.items.length > 5)
    itemLines.push(`  ... +${order.items.length - 5}`);

  await sendMessage(
    userId,
    [
      `📋 Замовлення ${order.code1C ?? order.id.slice(0, 8)}`,
      ``,
      `Статус: ${statusLabel}`,
      `Клієнт: ${order.customer.name}`,
      `Сума: €${order.totalEur.toFixed(2)}`,
      `Позицій: ${order.items.length}`,
      `Дата: ${new Date(order.createdAt).toLocaleDateString("uk-UA")}`,
      ``,
      ...itemLines,
    ].join("\n"),
    mainMenuKeyboard(),
  );
}

async function handleCategories(userId: string): Promise<void> {
  const lines = CATEGORIES.map(
    (cat) => `${cat.name}: ${cat.subcategories.map((s) => s.name).join(", ")}`,
  );
  await sendMessage(
    userId,
    [`📂 Категорії:`, ``, ...lines, ``, `${SITE_URL}/catalog`].join("\n"),
    mainMenuKeyboard(),
  );
}

async function handleHelp(userId: string): Promise<void> {
  await sendMessage(
    userId,
    [
      `❓ Допомога ${APP_NAME} Bot`,
      ``,
      `🔍 Пошук — напишіть назву товару`,
      `📦 Лоти — перегляд вільних лотів`,
      `📋 Замовлення — перевірка статусу`,
      `📂 Категорії — список категорій`,
      ``,
      `📱 ${CONTACTS.phones.join(", ")}`,
      `📧 ${CONTACTS.email}`,
      `💬 Telegram: ${CONTACTS.telegram}`,
      `📍 ${CONTACTS.location}`,
    ].join("\n"),
    mainMenuKeyboard(),
  );
}

// ─── Webhook POST handler ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!AUTH_TOKEN) {
    return NextResponse.json({ error: "Bot not configured" }, { status: 503 });
  }

  // Viber always signs callbacks with the bot auth token. Reject any request
  // that lacks a valid HMAC-SHA256 signature — unsigned callbacks are never OK.
  const signature = request.headers.get("x-viber-content-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 403 });
  }

  const body = await request.text();
  const expectedSig = crypto
    .createHmac("sha256", AUTH_TOKEN)
    .update(body)
    .digest("hex");
  const providedBuf = Buffer.from(signature, "hex");
  const expectedBuf = Buffer.from(expectedSig, "hex");
  if (
    providedBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  let event: {
    event: string;
    sender?: { id: string; name?: string };
    user?: { id: string; name?: string };
    message?: { text?: string };
  };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    switch (event.event) {
      case "webhook":
        // Viber sends this to confirm webhook registration
        break;

      case "conversation_started":
      case "subscribed":
        if (event.user) {
          await handleStart(event.user.id, event.user.name);
        }
        break;

      case "message":
        if (event.sender && event.message) {
          const userId = event.sender.id;
          const text = event.message.text?.trim() ?? "";

          if (text === "menu:main" || text === "/start")
            await handleStart(userId, event.sender.name);
          else if (text === "menu:search") {
            pendingInput.set(userId, "search");
            await sendMessage(userId, "🔍 Введіть назву товару:", {
              Type: "keyboard",
              DefaultHeight: false,
              BgColor: "#f5f5f5",
              Buttons: [
                {
                  Columns: 6,
                  Rows: 1,
                  Text: '<font color="#999">↩️ Меню</font>',
                  ActionType: "reply",
                  ActionBody: "menu:main",
                  BgColor: "#f5f5f5",
                  TextSize: "small",
                  TextHAlign: "center",
                  TextVAlign: "middle",
                },
              ],
            });
          } else if (text === "menu:lots") await handleLots(userId, "");
          else if (text === "menu:categories") await handleCategories(userId);
          else if (text === "menu:order") {
            pendingInput.set(userId, "order");
            await sendMessage(userId, "📋 Введіть ID замовлення:", {
              Type: "keyboard",
              DefaultHeight: false,
              BgColor: "#f5f5f5",
              Buttons: [
                {
                  Columns: 6,
                  Rows: 1,
                  Text: '<font color="#999">↩️ Меню</font>',
                  ActionType: "reply",
                  ActionBody: "menu:main",
                  BgColor: "#f5f5f5",
                  TextSize: "small",
                  TextHAlign: "center",
                  TextVAlign: "middle",
                },
              ],
            });
          } else if (text === "menu:help") await handleHelp(userId);
          else if (text.startsWith("lots:")) {
            const key = text.replace("lots:", "");
            const label = QUALITY_LABELS[key as QualityLevel] ?? key;
            await handleLots(userId, label);
          } else {
            const pending = pendingInput.get(userId);
            if (pending === "search") {
              pendingInput.delete(userId);
              await handleSearch(userId, text);
            } else if (pending === "order") {
              pendingInput.delete(userId);
              await handleOrder(userId, text);
            } else if (text.length >= 2) await handleSearch(userId, text);
            else
              await sendMessage(
                userId,
                "Оберіть дію або напишіть назву товару 🔍",
                mainMenuKeyboard(),
              );
          }
        }
        break;

      default:
        // delivered, seen, failed — ignore
        break;
    }
  } catch (error) {
    console.error("Viber webhook error:", error);
  }

  return NextResponse.json({ status: 0 });
}
