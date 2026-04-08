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

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ltex.com.ua";

interface OrderEmailData {
  orderId: string;
  customerName: string;
  customerEmail: string;
  totalEur: number;
  totalUah: number;
  itemCount: number;
  totalWeight: number;
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

async function sendViaSMTP(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
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
    to,
    subject,
    html,
  });
}

async function sendViaResend(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${APP_NAME} <${getFromAddress()}>`,
      to: [to],
      subject,
      html,
    }),
  });
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const transport = isEmailConfigured();
  if (!transport) return;

  try {
    if (transport === "smtp") {
      await sendViaSMTP(to, subject, html);
    } else {
      await sendViaResend(to, subject, html);
    }
  } catch (err) {
    console.error("Failed to send email:", err);
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

export async function sendOrderConfirmationEmail(
  data: OrderEmailData,
): Promise<void> {
  const subject = `${APP_NAME} — Замовлення #${data.orderId.slice(0, 8)} оформлено`;

  const content = `
    <h2 style="margin:0 0 16px;color:#16a34a;font-size:18px">Замовлення оформлено!</h2>
    <p style="color:#374151;line-height:1.6">
      Шановний(а) ${data.customerName},<br>
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
