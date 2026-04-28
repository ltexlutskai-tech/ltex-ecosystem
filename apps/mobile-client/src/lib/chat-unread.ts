/**
 * Chat unread badge state for mobile client.
 *
 * Polls GET /api/mobile/chat/unread every 30s while the user is signed in,
 * exposes the count to the bottom-tab MoreTab and the MoreScreen chat row,
 * and lets ChatScreen optimistically clear the badge on mount.
 */

import { createContext, useContext } from "react";

export interface ChatUnreadContextType {
  count: number;
  refresh: () => Promise<void>;
  markRead: () => void;
}

export const ChatUnreadContext = createContext<ChatUnreadContextType | null>(
  null,
);

export function useChatUnread(): ChatUnreadContextType {
  const ctx = useContext(ChatUnreadContext);
  if (!ctx)
    throw new Error("useChatUnread must be used within ChatUnreadProvider");
  return ctx;
}
