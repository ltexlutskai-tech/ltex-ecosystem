import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  AppState,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { chatApi } from "@/lib/api";
import { ChatSkeleton } from "@/components/SkeletonLoader";

interface ChatMessage {
  id: string;
  text: string;
  imageUrl: string | null;
  sender: "customer" | "manager";
  isRead: boolean;
  createdAt: string;
}

interface ChatScreenProps {
  navigation?: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
}

const POLL_FALLBACK_INTERVAL = 10000;

export function ChatScreen(_props: ChatScreenProps) {
  const { customerId } = useAuth();
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [useSSE, setUseSSE] = useState(true);

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = useCallback(
    async (loadCursor?: string, prepend = false) => {
      if (!customerId) return;
      try {
        const data = (await chatApi.messages(loadCursor)) as {
          messages: ChatMessage[];
          nextCursor: string | null;
        };
        const fetched = data.messages ?? [];

        if (prepend) {
          setMessages((prev) => [...prev, ...fetched]);
        } else {
          setMessages(fetched);
        }

        if (data.nextCursor) {
          setCursor(data.nextCursor);
          setHasMore(true);
        } else {
          setHasMore(false);
        }

        // Mark unread manager messages as read
        if (fetched.length > 0 && !loadCursor) {
          const unreadManagerMsg = fetched.find(
            (m) => m.sender === "manager" && !m.isRead,
          );
          if (unreadManagerMsg) {
            chatApi.markRead(unreadManagerMsg.id).catch(() => {});
          }
        }
      } catch {
        // Silently handle polling errors
      }
    },
    [customerId],
  );

  // ─── SSE connection ──────────────────────────────────────────────────────────
  const connectSSE = useCallback(() => {
    if (!customerId) return;

    // Check if EventSource is available (not available in all RN environments)
    if (typeof EventSource === "undefined") {
      setUseSSE(false);
      return;
    }

    try {
      const url = chatApi.streamUrl();
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.addEventListener("connected", () => {
        // SSE connected successfully — no action needed
      });

      es.addEventListener("message", (event: MessageEvent) => {
        try {
          const msg: ChatMessage = JSON.parse(event.data);
          setMessages((prev) => {
            // Avoid duplicates (e.g. own messages already added optimistically)
            if (prev.some((m) => m.id === msg.id)) {
              // Update existing message (e.g. temp → real id)
              return prev.map((m) => (m.id === msg.id ? msg : m));
            }
            // Insert at the beginning (newest first, list is inverted)
            return [msg, ...prev];
          });

          // Auto-mark manager messages as read while chat is open
          if (msg.sender === "manager" && !msg.isRead) {
            chatApi.markRead(msg.id).catch(() => {});
          }
        } catch {
          // Ignore parse errors
        }
      });

      es.addEventListener("timeout", () => {
        // Server closed the connection after 5 min — reconnect
        closeSSE();
        connectSSE();
      });

      es.addEventListener("error", () => {
        // SSE failed — fall back to polling
        closeSSE();
        setUseSSE(false);
      });

      // Clean up polling if SSE is active
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    } catch {
      setUseSSE(false);
    }
  }, [customerId]);

  const closeSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  // ─── Polling fallback ────────────────────────────────────────────────────────
  const startPolling = useCallback(() => {
    if (!customerId || pollTimerRef.current) return;
    pollTimerRef.current = setInterval(() => {
      fetchMessages();
    }, POLL_FALLBACK_INTERVAL);
  }, [customerId, fetchMessages]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  // ─── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchMessages().finally(() => setLoading(false));
  }, [fetchMessages]);

  // ─── Start SSE or polling ────────────────────────────────────────────────────
  useEffect(() => {
    if (!customerId) return;

    if (useSSE) {
      connectSSE();
    } else {
      startPolling();
    }

    return () => {
      closeSSE();
      stopPolling();
    };
  }, [customerId, useSSE, connectSSE, closeSSE, startPolling, stopPolling]);

  // ─── Reconnect when app comes to foreground ──────────────────────────────────
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && customerId) {
        // Refresh messages when app comes back
        fetchMessages();
        // Reconnect SSE if it was closed
        if (useSSE && !eventSourceRef.current) {
          connectSSE();
        }
      } else if (nextState === "background") {
        // Close SSE when app goes to background to save resources
        closeSSE();
      }
    });
    return () => subscription.remove();
  }, [customerId, useSSE, fetchMessages, connectSSE, closeSSE]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !cursor) return;
    setLoadingMore(true);
    await fetchMessages(cursor, true);
    setLoadingMore(false);
  }, [loadingMore, hasMore, cursor, fetchMessages]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !customerId) return;

    setSending(true);
    setText("");

    // Optimistic update
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: tempId,
      text: trimmed,
      imageUrl: null,
      sender: "customer",
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [optimisticMessage, ...prev]);

    try {
      const data = (await chatApi.send(trimmed)) as {
        message: ChatMessage;
      };
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? (data.message ?? m) : m)),
      );
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setText(trimmed);
      Alert.alert("Помилка", "Не вдалось відправити повідомлення");
    } finally {
      setSending(false);
    }
  }, [text, customerId]);

  const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("uk-UA", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDateSeparator = (dateStr: string): string => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return "Сьогодні";
    if (date.toDateString() === yesterday.toDateString()) return "Вчора";

    return date.toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "long",
    });
  };

  const shouldShowDateSeparator = (
    current: ChatMessage,
    previous: ChatMessage | undefined,
  ): boolean => {
    if (!previous) return true;
    const currentDate = new Date(current.createdAt).toDateString();
    const previousDate = new Date(previous.createdAt).toDateString();
    return currentDate !== previousDate;
  };

  const renderMessage = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => {
      const isCustomer = item.sender === "customer";
      const previousMessage = messages[index + 1];
      const showDate = shouldShowDateSeparator(item, previousMessage);

      return (
        <View>
          {showDate && (
            <View style={styles.dateSeparator}>
              <Text style={styles.dateSeparatorText}>
                {formatDateSeparator(item.createdAt)}
              </Text>
            </View>
          )}
          <View
            style={[
              styles.messageRow,
              isCustomer ? styles.messageRowRight : styles.messageRowLeft,
            ]}
          >
            <View
              style={[
                styles.messageBubble,
                isCustomer ? styles.customerBubble : styles.managerBubble,
              ]}
            >
              {!isCustomer && (
                <Text style={styles.managerName}>Менеджер L-TEX</Text>
              )}
              <Text
                style={[
                  styles.messageText,
                  isCustomer ? styles.customerText : styles.managerText,
                ]}
              >
                {item.text}
              </Text>
              <View style={styles.messageFooter}>
                <Text
                  style={[
                    styles.messageTime,
                    isCustomer
                      ? styles.customerTimeText
                      : styles.managerTimeText,
                  ]}
                >
                  {formatTime(item.createdAt)}
                </Text>
                {isCustomer && (
                  <Ionicons
                    name={item.isRead ? "checkmark-done" : "checkmark"}
                    size={14}
                    color={item.isRead ? "#86efac" : "#bbf7d0"}
                  />
                )}
              </View>
            </View>
          </View>
        </View>
      );
    },
    [messages],
  );

  if (!customerId) {
    return (
      <View style={styles.centered}>
        <Ionicons name="chatbubbles-outline" size={48} color="#d1d5db" />
        <Text style={styles.emptyTitle}>Увійдіть для чату з менеджером</Text>
      </View>
    );
  }

  if (loading) {
    return <ChatSkeleton />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      {/* Header info */}
      <View style={styles.chatHeader}>
        <View style={styles.chatHeaderDot} />
        <Text style={styles.chatHeaderText}>Чат з менеджером L-TEX</Text>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        inverted
        contentContainerStyle={
          messages.length === 0 ? styles.emptyChat : styles.chatContent
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadingMoreContainer}>
              <ActivityIndicator size="small" color="#16a34a" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyChatContent}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={40}
              color="#d1d5db"
            />
            <Text style={styles.emptyChatTitle}>Початок чату</Text>
            <Text style={styles.emptyChatHint}>
              Напишіть повідомлення менеджеру L-TEX.{"\n"}
              Ми відповімо якнайшвидше!
            </Text>
          </View>
        }
      />

      {/* Input bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.textInput}
          value={text}
          onChangeText={setText}
          placeholder="Написати повідомлення..."
          placeholderTextColor="#9ca3af"
          multiline
          maxLength={2000}
          returnKeyType="default"
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!text.trim() || sending) && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!text.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4b5563",
    marginTop: 16,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6b7280",
  },

  // Chat header
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  chatHeaderDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#16a34a",
  },
  chatHeaderText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },

  // Chat content
  chatContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  emptyChat: {
    flexGrow: 1,
  },
  emptyChatContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    transform: [{ scaleY: -1 }],
  },
  emptyChatTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
    marginTop: 12,
  },
  emptyChatHint: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },

  // Date separator
  dateSeparator: {
    alignItems: "center",
    paddingVertical: 8,
  },
  dateSeparatorText: {
    fontSize: 12,
    color: "#9ca3af",
    backgroundColor: "#e5e7eb",
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: "hidden",
  },

  // Messages
  messageRow: {
    marginVertical: 2,
    maxWidth: "80%",
  },
  messageRowRight: {
    alignSelf: "flex-end",
  },
  messageRowLeft: {
    alignSelf: "flex-start",
  },
  messageBubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: "100%",
  },
  customerBubble: {
    backgroundColor: "#16a34a",
    borderBottomRightRadius: 4,
  },
  managerBubble: {
    backgroundColor: "#fff",
    borderBottomLeftRadius: 4,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
  },
  managerName: {
    fontSize: 11,
    fontWeight: "700",
    color: "#16a34a",
    marginBottom: 2,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  customerText: {
    color: "#fff",
  },
  managerText: {
    color: "#1f2937",
  },
  messageFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 2,
  },
  messageTime: {
    fontSize: 11,
  },
  customerTimeText: {
    color: "#bbf7d0",
  },
  managerTimeText: {
    color: "#9ca3af",
  },

  loadingMoreContainer: {
    paddingVertical: 12,
    alignItems: "center",
  },

  // Input bar
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    gap: 8,
  },
  textInput: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: "#1f2937",
    maxHeight: 100,
    minHeight: 40,
  },
  sendButton: {
    backgroundColor: "#16a34a",
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#d1d5db",
  },
});
