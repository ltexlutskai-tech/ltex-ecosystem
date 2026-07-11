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

export interface MessengerMessageItem {
  id: string;
  conversationId: string;
  authorId: string | null;
  authorName: string | null;
  kind: "text" | "system";
  text: string;
  isMine: boolean;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export interface MessengerThreadResponse {
  conversation: {
    id: string;
    type: "direct" | "group";
    title: string;
    counterpart: MessengerUserBrief | null;
    members: MessengerUserBrief[];
  };
  messages: MessengerMessageItem[];
}
