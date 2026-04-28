import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { ChatUnreadContext } from "./chat-unread";
import { chatApi } from "./api";
import { useAuth } from "./auth";

const POLL_INTERVAL_MS = 30_000;

export function ChatUnreadProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { customerId } = useAuth();
  const [count, setCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCount = useCallback(async () => {
    if (!customerId) return;
    try {
      const data = await chatApi.unreadCount();
      setCount(data.count ?? 0);
    } catch {
      // Network/auth errors are non-fatal — keep last known count.
    }
  }, [customerId]);

  const refresh = useCallback(async () => {
    await fetchCount();
  }, [fetchCount]);

  const markRead = useCallback(() => {
    setCount(0);
  }, []);

  // Polling lifecycle: only run while the user is signed in. Reset to 0 on
  // logout so the badge clears immediately.
  useEffect(() => {
    if (!customerId) {
      setCount(0);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    fetchCount();
    timerRef.current = setInterval(fetchCount, POLL_INTERVAL_MS);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [customerId, fetchCount]);

  // Refresh on app foreground so the badge is up-to-date right when the user
  // comes back rather than 30s later.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && customerId) {
        fetchCount();
      }
    });
    return () => sub.remove();
  }, [customerId, fetchCount]);

  return (
    <ChatUnreadContext.Provider value={{ count, refresh, markRead }}>
      {children}
    </ChatUnreadContext.Provider>
  );
}
