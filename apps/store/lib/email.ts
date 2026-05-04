/**
 * Email notification utilities for order lifecycle.
 *
 * Supports two transport modes:
 * 1. SMTP via nodemailer (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM)
 * 2. Resend API (RESEND_API_KEY, SMTP_FROM as from address)
 *
 * If neither is configured, emails are silently skipped.
 */

import { APP_NAME, CONTACTS } from "@ltex/shared";
import { getDictionary } from "@/lib/i18n";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua";

export interface OrderEmailLineItem {
  productName: string;
  barcode: string | null;
  weight: number;
  quantity: number;
  priceEur: number;
}

interface OrderEmailData {
  orderId: string;
  customerName: string;
  customerEmail: string;
  totalEur: number;
  totalUah: number;
  itemCount: number;
  totalWeight: number;
  items?: OrderEmailLineItem[];
}

interface StatusEmailData {
  orderId: string;
  customerName: string;
  customerEmail: string;
  status: string;
  statusLabel: string;
  orderRef: string;
}

function getFromAddress(): string {
  return process.env.SMTP_FROM ?? `noreply@ltex.com.ua`;
}

function isEmailConfigured(): "smtp" | "resend" | false {
  if (
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  ) {
    return "smtp";
  }
  if (process.env.RESEND_API_KEY) {
    return "resend";
  }
  return false;
}

interface SendPayload {
  to: string;
  subject: string;
  html: string;
}

/**
 * Mask an email address for logging — preserves enough info to debug
 * (domain, first two chars of local part) without leaking the full PII.
 * Exported for testability.
 */
export function maskEmail(email: string | undefined): string {
  if (!email) return "(unknown)";
  const at = email.indexOf("@");
  if (at < 1) return "(invalid)";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local.slice(0, 2)}***@${domain}`;
}

/**
 * Return true when an error looks like a transient transport failure
 * (network blip, timeout, 5xx upstream) that is worth retrying.
 * 4xx responses, validation errors, and bad credentials are NOT transient.
 * Exported for testability.
 */
export function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError") return true;
  const code = (err as NodeJS.ErrnoException).code;
  if (
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "EAI_AGAIN" ||
    code === "ENOTFOUND" ||
    code === "ESOCKET"
  ) {
    return true;
  }
  const msg = err.message.toLowerCase();
  if (
    msg.includes("timeout") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("network")
  ) {
    return true;
  }
  // 5xx anywhere in the message (e.g. "Resend 503: Service Unavailable")
  return /\b5\d\d\b/.test(msg);
}

/**
 * Run `send(payload)` with up to `attempts` retries on transient errors.
 * Backoff: 0s, 2s, 6s. Non-transient errors throw immediately (no retry).
 * On exhaustion logs structured PII-masked record and re-throws.
 * Exported for testability.
 */
export async function sendWithRetry(
  send: (p: SendPayload) => Promise<void>,
  payload: SendPayload,
  attempts = 3,
): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await send(payload);
      return;
    } catch (err) {
      lastErr = err;
      if (!isTransientError(err)) throw err;
      if (i < attempts - 1) {
        const delay = i === 0 ? 2000 : 6000;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  console.error("[L-TEX] Email send failed after retries", {
    to: maskEmail(payload.to),
    subject: payload.subject,
    attempts,
    error: lastErr instanceof Error ? lastErr.message : String(lastErr),
  });
  throw lastErr;
}

async function sendViaSMTP(payload: SendPayload): Promise<void> {
  // Dynamic import to avoid bundling nodemailer when not needed
  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? "587", 10),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: `${APP_NAME} <${getFromAddress()}>`,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
  });
}

async function sendViaResend(payload: SendPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${APP_NAME} <${getFromAddress()}>`,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    // Surface status code so isTransientError can decide whether to retry.
    throw new Error(`Resend ${res.status}: ${res.statusText}`);
  }
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const transport = isEmailConfigured();
  if (!transport) return;

  const payload: SendPayload = { to, subject, html };
  const send = transport === "smtp" ? sendViaSMTP : sendViaResend;
  try {
    await sendWithRetry(send, payload);
  } catch (err) {
    // Transient failures that exhausted retries are already logged inside
    // sendWithRetry. Non-transient errors (4xx, validation) skip retry —
    // log them here so they don't fall through silently.
    if (!isTransientError(err)) {
      console.error("[L-TEX] Email send failed (non-retriable)", {
        to: maskEmail(to),
        subject,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="uk">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:20px">
    <div style="background:#16a34a;padding:16px 24px;border-radius:8px 8px 0 0">
      <h1 style="margin:0;color:#fff;font-size:20px">${APP_NAME}</h1>
    </div>
    <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
      ${content}
    </div>
    <div style="text-align:center;padding:16px;color:#9ca3af;font-size:12px">
      <p style="margin:4px 0">${APP_NAME} — ${CONTACTS.location}</p>
      <p style="margin:4px 0">${CONTACTS.phones.join(" | ")} | ${CONTACTS.email}</p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderItemsSection(
  heading: string,
  hint: string,
  items: OrderEmailLineItem[],
): string {
  if (items.length === 0) return "";
  const rows = items
    .map((i) => {
      const barcodeCell = i.barcode
        ? `<span style="font-family:monospace;color:#374151">${escapeHtml(i.barcode)}</span>`
        : `<span style="color:#9ca3af;font-style:italic">—</span>`;
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #f3f4f6">${escapeHtml(i.productName)}</td>
        <td style="padding:8px;border-bottom:1px solid #f3f4f6">${barcodeCell}</td>
        <td style="padding:8px;text-align:right;border-bottom:1px solid #f3f4f6">${i.weight.toFixed(1)} кг</td>
        <td style="padding:8px;text-align:right;border-bottom:1px solid #f3f4f6;font-weight:600">€${i.priceEur.toFixed(2)}</td>
      </tr>`;
    })
    .join("");
  return `
    <h3 style="margin:24px 0 6px;color:#374151;font-size:15px">${escapeHtml(heading)}</h3>
    <p style="margin:0 0 8px;color:#9ca3af;font-size:12px">${escapeHtml(hint)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#f9fafb;color:#6b7280">
          <th style="padding:8px;text-align:left;font-weight:500">Товар</th>
          <th style="padding:8px;text-align:left;font-weight:500">Штрихкод</th>
          <th style="padding:8px;text-align:right;font-weight:500">Вага</th>
          <th style="padding:8px;text-align:right;font-weight:500">Сума</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

export async function sendOrderConfirmationEmail(
  data: OrderEmailData,
): Promise<void> {
  const subject = `${APP_NAME} — Замовлення #${data.orderId.slice(0, 8)} оформлено`;

  const concreteLots = (data.items ?? []).filter((i) => i.barcode);
  const generalItems = (data.items ?? []).filter((i) => !i.barcode);

  const lotsSection = renderItemsSection(
    "Конкретні лоти",
    "Ці лоти зарезервовані за вашим замовленням.",
    concreteLots,
  );
  const generalSection = renderItemsSection(
    "Загальні позиції (потрібно підібрати лот)",
    "Менеджер підбере доступний лот за вашим запитом і підтвердить деталі.",
    generalItems,
  );

  const content = `
    <h2 style="margin:0 0 16px;color:#16a34a;font-size:18px">Замовлення оформлено!</h2>
    <p style="color:#374151;line-height:1.6">
      Шановний(а) ${escapeHtml(data.customerName)},<br>
      Дякуємо за замовлення! Ми зв'яжемося з вами найближчим часом для підтвердження.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr>
        <td style="padding:8px 0;color:#6b7280;border-bottom:1px solid #f3f4f6">Замовлення</td>
        <td style="padding:8px 0;text-align:right;font-weight:600;border-bottom:1px solid #f3f4f6">#${data.orderId.slice(0, 8)}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6b7280;border-bottom:1px solid #f3f4f6">Позицій</td>
        <td style="padding:8px 0;text-align:right;border-bottom:1px solid #f3f4f6">${data.itemCount}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6b7280;border-bottom:1px solid #f3f4f6">Вага</td>
        <td style="padding:8px 0;text-align:right;border-bottom:1px solid #f3f4f6">${data.totalWeight.toFixed(1)} кг</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6b7280">Сума</td>
        <td style="padding:8px 0;text-align:right;font-size:18px;font-weight:700;color:#16a34a">€${data.totalEur.toFixed(2)}</td>
      </tr>
      ${data.totalUah > 0 ? `<tr><td></td><td style="padding:0 0 8px;text-align:right;color:#9ca3af;font-size:13px">≈ ₴${data.totalUah.toFixed(2)}</td></tr>` : ""}
    </table>
    ${lotsSection}
    ${generalSection}
    <div style="text-align:center;margin:24px 0">
      <a href="${SITE_URL}/order/${data.orderId}/status" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600">
        Відстежити замовлення
      </a>
    </div>
    <p style="color:#9ca3af;font-size:13px;text-align:center">
      Зв'яжіться з нами: Telegram <a href="https://t.me/${CONTACTS.telegram.replace("@", "")}" style="color:#16a34a">${CONTACTS.telegram}</a>
    </p>`;

  await sendEmail(data.customerEmail, subject, baseLayout(content));
}

export async function sendWelcomeNewsletterEmail(email: string): Promise<void> {
  const dict = getDictionary();
  const { subject, heading, body } = dict.newsletter.welcomeEmail;

  if (!isEmailConfigured()) {
    console.info(
      "[L-TEX] Email provider not configured — welcome newsletter email skipped.",
    );
    return;
  }

  const paragraphs = body
    .split("\n\n")
    .map(
      (chunk) =>
        `<p style="color:#374151;line-height:1.6;margin:0 0 12px">${chunk
          .split("\n")
          .map((line) =>
            line
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;"),
          )
          .join("<br>")}</p>`,
    )
    .join("");

  const content = `
    <h2 style="margin:0 0 16px;color:#16a34a;font-size:18px">${heading}</h2>
    ${paragraphs}
    <div style="text-align:center;margin:24px 0">
      <a href="${SITE_URL}/catalog" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600">
        Переглянути асортимент
      </a>
    </div>
    <p style="color:#9ca3af;font-size:13px;text-align:center">
      Зв'яжіться з нами: Telegram <a href="https://t.me/${CONTACTS.telegram.replace("@", "")}" style="color:#16a34a">${CONTACTS.telegram}</a>
    </p>`;

  await sendEmail(email, subject, baseLayout(content));
}

export async function sendOrderStatusEmail(
  data: StatusEmailData,
): Promise<void> {
  const subject = `${APP_NAME} — Замовлення #${data.orderRef}: ${data.statusLabel}`;

  const statusColors: Record<string, string> = {
    confirmed: "#16a34a",
    processing: "#2563eb",
    shipped: "#7c3aed",
    delivered: "#16a34a",
    cancelled: "#dc2626",
  };
  const color = statusColors[data.status] ?? "#374151";

  const content = `
    <h2 style="margin:0 0 16px;color:#374151;font-size:18px">Статус замовлення оновлено</h2>
    <p style="color:#374151;line-height:1.6">
      Шановний(а) ${data.customerName},<br>
      Статус вашого замовлення <strong>#${data.orderRef}</strong> змінено:
    </p>
    <div style="text-align:center;margin:20px 0">
      <span style="display:inline-block;background:${color};color:#fff;padding:8px 20px;border-radius:20px;font-weight:600;font-size:16px">
        ${data.statusLabel}
      </span>
    </div>
    <div style="text-align:center;margin:24px 0">
      <a href="${SITE_URL}/order/${data.orderId}/status" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600">
        Відстежити замовлення
      </a>
    </div>
    <p style="color:#9ca3af;font-size:13px;text-align:center">
      Зв'яжіться з нами: Telegram <a href="https://t.me/${CONTACTS.telegram.replace("@", "")}" style="color:#16a34a">${CONTACTS.telegram}</a>
    </p>`;

  await sendEmail(data.customerEmail, subject, baseLayout(content));
}
