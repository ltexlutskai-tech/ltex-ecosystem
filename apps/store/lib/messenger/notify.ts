import { prisma } from "@ltex/db";
import { telegramSender } from "@/lib/chat/platform-send";

// Не пушимо тим, хто щойно був у системі (ймовірно, уже в чаті) — антиспам.
const AWAY_MS = 3 * 60 * 1000;
const PREVIEW_MAX = 120;

function shorten(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > PREVIEW_MAX ? `${t.slice(0, PREVIEW_MAX)}…` : t;
}

/**
 * Best-effort Telegram-push учасникам розмови про нове повідомлення.
 * Надсилаємо лише тим, хто:
 *  - не автор;
 *  - має прив'язаний Telegram (`telegramChatId`);
 *  - «відсутній» (lastSeenAt порожній або старіший за AWAY_MS) — щоб не
 *    спамити активним, хто вже в чаті.
 * Ніколи не кидає — помилки ковтаються.
 */
export async function notifyNewMessage(opts: {
  conversationId: string;
  authorId: string;
  authorName: string;
  preview: string;
}): Promise<void> {
  try {
    const conv = await prisma.messengerConversation.findUnique({
      where: { id: opts.conversationId },
      select: {
        type: true,
        title: true,
        members: {
          where: { leftAt: null, userId: { not: opts.authorId } },
          select: {
            user: {
              select: { telegramChatId: true, lastSeenAt: true },
            },
          },
        },
      },
    });
    if (!conv) return;

    const now = Date.now();
    const header =
      conv.type === "group"
        ? `${opts.authorName} · група «${conv.title ?? ""}»`
        : opts.authorName;
    const text = `💬 ${header}:\n${shorten(opts.preview)}`;

    await Promise.all(
      conv.members.map(async (m) => {
        const u = m.user;
        if (!u.telegramChatId) return;
        const away =
          !u.lastSeenAt || now - new Date(u.lastSeenAt).getTime() > AWAY_MS;
        if (!away) return;
        try {
          await telegramSender.send(u.telegramChatId, text);
        } catch {
          // ignore per-recipient failures
        }
      }),
    );
  } catch {
    // best-effort
  }
}

/** Побудова прев'ю для push із тексту/вкладень/докрефа. */
export function buildPushPreview(opts: {
  text?: string | null;
  hasImage?: boolean;
  hasFile?: boolean;
  docRefLabel?: string | null;
}): string {
  if (opts.text && opts.text.trim()) return opts.text;
  if (opts.docRefLabel) return `📎 ${opts.docRefLabel}`;
  if (opts.hasImage) return "📷 Фото";
  if (opts.hasFile) return "📎 Файл";
  return "Нове повідомлення";
}
