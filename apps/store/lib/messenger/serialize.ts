import type { MessengerMessageItem } from "./types";

export const DELETED_PLACEHOLDER = "Повідомлення видалено";

interface ReplyRowLike {
  id: string;
  authorId: string | null;
  text: string;
  deletedAt: Date | null;
}

export interface MessageRowLike {
  id: string;
  conversationId: string;
  authorId: string | null;
  kind: "text" | "system";
  text: string;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  replyTo?: ReplyRowLike | null;
}

/** Короткий прев'ю тексту для цитати/списку розмов. */
export function makePreview(text: string, max = 120): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/**
 * Приводить рядок повідомлення до форми відповіді API. Видалені повідомлення
 * маскуються плейсхолдером усім, крім owner (він бачить оригінал в архіві).
 */
export function serializeMessage(
  row: MessageRowLike,
  opts: {
    currentUserId: string;
    isOwner: boolean;
    nameById: Map<string, string>;
  },
): MessengerMessageItem {
  const hidden = row.deletedAt !== null && !opts.isOwner;
  const reply = row.replyTo
    ? {
        id: row.replyTo.id,
        authorName: row.replyTo.authorId
          ? (opts.nameById.get(row.replyTo.authorId) ?? null)
          : null,
        preview:
          row.replyTo.deletedAt && !opts.isOwner
            ? DELETED_PLACEHOLDER
            : makePreview(row.replyTo.text),
      }
    : null;

  return {
    id: row.id,
    conversationId: row.conversationId,
    authorId: row.authorId,
    authorName: row.authorId ? (opts.nameById.get(row.authorId) ?? null) : null,
    kind: row.kind,
    text: hidden ? DELETED_PLACEHOLDER : row.text,
    isMine: row.authorId === opts.currentUserId,
    replyTo: reply,
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}
