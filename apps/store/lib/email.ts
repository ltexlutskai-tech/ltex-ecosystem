/**
 * Email notification utilities for order lifecycle.
 *
 * Supports two transport modes:
 * 1. SMTP via nodemailer (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM)
 * 2. Resend API (RESEND_API_KEY, SMTP_FROM as from address)
 *
 * If neither is configured, emails are silently skipped.
 *
 * Persistence (S70): customer-facing functions enqueue an EmailJob row in
 * Postgres rather than sending synchronously. A separate cron job
 * (`/api/cron/process-email-queue`) drains the queue with attempt accounting,
 * exponential backoff, and a `failed` terminal state visible in /admin/emails.
 */

import { APP_NAME, CONTACTS } from "@ltex/shared";
import { prisma } from "@ltex/db";
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

export type EmailSource =
  | "order"
  | "order_status"
  | "newsletter"
  | "quote"
  | "manager-auth";

export interface EnqueueEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  source: EmailSource;
  referenceId?: string;
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
 * Replace email + phone substrings inside an arbitrary string with masked
 * equivalents — used before persisting `lastError` to avoid leaking PII into
 * the DLQ table or admin UI.
 */
export function maskPii(input: string): string {
  // Mask email addresses (preserve domain, first 2 chars of local part).
  let out = input.replace(
    /([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
    (_, local: string, domain: string) => `${local.slice(0, 2)}***@${domain}`,
  );
  // Mask phone numbers — sequences of 9+ digits (optionally with +/-/space).
  out = out.replace(/\+?\d[\d\s().-]{8,}\d/g, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length < 9) return m;
    return `${digits.slice(0, 3)}***${digits.slice(-2)}`;
  });
  return out;
}

const MAX_LAST_ERROR_LEN = 500;

function describeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return maskPii(msg).slice(0, MAX_LAST_ERROR_LEN);
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
 *
 * Kept exported for legacy use (and tests). The DLQ flow (`processEmailQueue`)
 * does its own per-job attempt accounting via the DB and does NOT call this.
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

/**
 * Single-attempt low-level send. Picks the configured transport.
 * Returns silently if no transport is configured (preserves dev-mode behavior
 * for the legacy `sendEmail` callers).
 */
async function attemptSend(payload: SendPayload): Promise<void> {
  const transport = isEmailConfigured();
  if (!transport) return;
  const send = transport === "smtp" ? sendViaSMTP : sendViaResend;
  await send(payload);
}

/**
 * Persist a pending EmailJob row. Fire-and-forget from caller's POV — never
 * throws into the request path; failures to enqueue are logged with masked PII.
 *
 * If no transport is configured AND we're outside production, the email is
 * silently dropped (matches legacy dev-mode behavior). In production the row
 * is still persisted so it can be replayed once a transport is wired up.
 */
export async function enqueueEmail(input: EnqueueEmailInput): Promise<void> {
  if (!isEmailConfigured() && process.env.NODE_ENV !== "production") {
    console.info(
      "[L-TEX] Email provider not configured — enqueueEmail skipped",
      { source: input.source, subject: input.subject },
    );
    return;
  }
  try {
    await prisma.emailJob.create({
      data: {
        to: input.to,
        subject: input.subject,
        htmlBody: input.html,
        textBody: input.text ?? null,
        source: input.source,
        referenceId: input.referenceId ?? null,
      },
    });
  } catch (err) {
    console.error("[L-TEX] enqueueEmail failed", {
      to: maskEmail(input.to),
      source: input.source,
      subject: input.subject,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Per-attempt backoff (minutes): 1m, 5m, 30m, 2h, 6h, 12h. The Nth retry
// (attempts incremented to N) reads index min(N-1, last).
const BACKOFF_MINUTES: readonly number[] = [1, 5, 30, 120, 360, 720] as const;

export function nextAttemptDelayMs(attempts: number): number {
  const idx = Math.min(Math.max(attempts - 1, 0), BACKOFF_MINUTES.length - 1);
  const minutes =
    BACKOFF_MINUTES[idx] ?? BACKOFF_MINUTES[BACKOFF_MINUTES.length - 1] ?? 60;
  return minutes * 60 * 1000;
}

export interface ProcessQueueResult {
  processed: number;
  sent: number;
  failed: number;
  retrying: number;
}

/**
 * Drain pending/retrying EmailJob rows whose `nextAttemptAt <= now`.
 * Each row is attempted once per invocation. Success → `sent`. Transient and
 * non-transient failures both increment `attempts`; row stays `retrying` until
 * `attempts >= maxAttempts`, at which point it's marked `failed` and an
 * alert-level log is emitted (admin UI surfaces failed jobs with a Retry CTA).
 */
export async function processEmailQueue(
  limit = 50,
): Promise<ProcessQueueResult> {
  const now = new Date();
  const jobs = await prisma.emailJob.findMany({
    where: {
      status: { in: ["pending", "retrying"] },
      nextAttemptAt: { lte: now },
    },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  });

  let sent = 0;
  let failed = 0;
  let retrying = 0;

  for (const job of jobs) {
    try {
      await attemptSend({
        to: job.to,
        subject: job.subject,
        html: job.htmlBody,
      });
      await prisma.emailJob.update({
        where: { id: job.id },
        data: {
          status: "sent",
          attempts: job.attempts + 1,
          sentAt: new Date(),
          lastError: null,
        },
      });
      sent++;
    } catch (err) {
      const nextAttempts = job.attempts + 1;
      const exhausted = nextAttempts >= job.maxAttempts;
      const lastError = describeError(err);
      if (exhausted) {
        await prisma.emailJob.update({
          where: { id: job.id },
          data: {
            status: "failed",
            attempts: nextAttempts,
            lastError,
          },
        });
        failed++;
        console.error("[L-TEX] EmailJob exhausted retries", {
          id: job.id,
          source: job.source,
          referenceId: job.referenceId,
          to: maskEmail(job.to),
          subject: job.subject,
          attempts: nextAttempts,
          maxAttempts: job.maxAttempts,
          lastError,
        });
      } else {
        const next = new Date(Date.now() + nextAttemptDelayMs(nextAttempts));
        await prisma.emailJob.update({
          where: { id: job.id },
          data: {
            status: "retrying",
            attempts: nextAttempts,
            nextAttemptAt: next,
            lastError,
          },
        });
        retrying++;
      }
    }
  }

  return { processed: jobs.length, sent, failed, retrying };
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

  await enqueueEmail({
    to: data.customerEmail,
    subject,
    html: baseLayout(content),
    source: "order",
    referenceId: data.orderId,
  });
}

export async function sendWelcomeNewsletterEmail(email: string): Promise<void> {
  const dict = getDictionary();
  const { subject, heading, body } = dict.newsletter.welcomeEmail;

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

  await enqueueEmail({
    to: email,
    subject,
    html: baseLayout(content),
    source: "newsletter",
  });
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

  await enqueueEmail({
    to: data.customerEmail,
    subject,
    html: baseLayout(content),
    source: "order_status",
    referenceId: data.orderId,
  });
}
