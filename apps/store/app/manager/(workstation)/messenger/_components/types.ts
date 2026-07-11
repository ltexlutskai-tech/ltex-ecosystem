export type {
  MessengerUserBrief,
  MessengerConversationListItem,
  MessengerMessageItem,
  MessengerThreadResponse,
} from "@/lib/messenger/types";

import type {
  MessengerConversationListItem,
  MessengerMessageItem,
  MessengerUserBrief,
} from "@/lib/messenger/types";

export interface ConversationsListResponse {
  conversations: MessengerConversationListItem[];
}

export interface UsersListResponse {
  users: MessengerUserBrief[];
}

export interface SendMessageResponse {
  message: MessengerMessageItem;
}

export interface OpenChatResponse {
  conversationId: string;
}
