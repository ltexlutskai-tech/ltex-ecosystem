/**
 * Спільні типи відповідей API внутрішнього месенджера — імпортуються і
 * серверними роутами, і клієнтськими компонентами.
 */

export interface MessengerUserBrief {
  id: string;
  fullName: string;
  role: string;
  lastSeenAt: string | null;
}

export interface MessengerConversationListItem {
  id: string;
  type: "direct" | "group";
  /** Заголовок для показу: назва групи або ім'я співрозмовника у direct. */
  title: string;
  /** Співрозмовник у direct-чаті (null для груп). */
  counterpart: MessengerUserBrief | null;
  lastMessagePreview: string | null;
  lastMessageAt: string;
  unread: number;
}

export interface MessengerReplyPreview {
  id: string;
  authorName: string | null;
  preview: string;
}

export interface MessengerAttachmentItem {
  id: string;
  kind: "image" | "file";
  url: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

export interface MessengerReactionSummary {
  emoji: string;
  count: number;
  /** Чи поставив цю реакцію поточний користувач. */
  mine: boolean;
}

export interface MessengerMessageItem {
  id: string;
  conversationId: string;
  authorId: string | null;
  authorName: string | null;
  kind: "text" | "system";
  text: string;
  isMine: boolean;
  replyTo: MessengerReplyPreview | null;
  attachments: MessengerAttachmentItem[];
  reactions: MessengerReactionSummary[];
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export interface MessengerThreadMember extends MessengerUserBrief {
  /** Роль у групі (для direct — завжди "member"). */
  groupRole: "member" | "admin";
}

export interface MessengerThreadResponse {
  conversation: {
    id: string;
    type: "direct" | "group";
    title: string;
    counterpart: MessengerUserBrief | null;
    members: MessengerThreadMember[];
    /** Чи може поточний користувач керувати групою (перейм./склад). */
    canManage: boolean;
    /** Роль поточного користувача в групі, або null якщо він не учасник. */
    myGroupRole: "member" | "admin" | null;
  };
  messages: MessengerMessageItem[];
}
