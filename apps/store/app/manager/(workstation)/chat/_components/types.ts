// Spільні типи для inbox-UI. Поля повторюють shape з API endpoint-ів:
//   - GET /api/v1/manager/chat/conversations        — список розмов
//   - GET /api/v1/manager/chat/conversations/[id]   — заголовок + тред

export type ChatPlatform = "telegram" | "viber" | "whatsapp" | "instagram";
export type ChatDirection = "in" | "out";
export type ChatSender = "client" | "manager" | "system";

export interface ConversationClientRef {
  id: string;
  name: string;
}

export interface ConversationAgentRef {
  id: string;
  fullName: string;
}

export interface ConversationListItem {
  id: string;
  platform: ChatPlatform;
  externalUserId: string;
  externalUserName: string | null;
  phone: string | null;
  clientId: string | null;
  agentUserId: string | null;
  status: string;
  unreadForManager: number;
  lastMessageAt: string;
  createdAt: string;
  client: ConversationClientRef | null;
}

export interface ConversationListResponse {
  conversations: ConversationListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ConversationHeader extends ConversationListItem {
  agent: ConversationAgentRef | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  direction: ChatDirection;
  sender: ChatSender;
  text: string;
  mediaUrl: string | null;
  externalMessageId: string | null;
  authorUserId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface ConversationThreadResponse {
  conversation: ConversationHeader;
  messages: ChatMessage[];
}

export interface SendMessageResponse {
  message: ChatMessage;
}
