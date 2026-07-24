"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button, Textarea, useToast } from "@ltex/ui";
import { BrandIcon } from "../../_components/brand-icons";
import { formatRelativeShort } from "../../_components/format-relative";
import { chatPlatformLabel } from "@/lib/chat/platforms";
import { broadcastChatRead } from "@/lib/chat/read-broadcast";
import type {
  ChatMessage,
  ConversationHeader,
  ConversationThreadResponse,
  SendMessageResponse,
} from "./types";

const POLL_INTERVAL_MS = 3_000;
const MAX_MESSAGE_LEN = 4_000;

export function ConversationThread({
  conversationId,
  onReadCleared,
  showClientLink = true,
}: {
  conversationId: string;
  /** Викликати після успішного `/read` (щоб список оновив unread). */
  onReadCleared: () => void;
  /**
   * Чи показувати у шапці лінк на картку клієнта. `false` — коли тред вбудований
   * У саму картку клієнта (вкладка «Повідомлення»), де лінк на себе зайвий.
   */
  showClientLink?: boolean;
}) {
  const [header, setHeader] = useState<ConversationHeader | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  // Початкове завантаження + при зміні conversationId.
  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/v1/manager/chat/conversations/${conversationId}`,
        { cache: "no-store" },
      );
      if (!r.ok) {
        setHeader(null);
        setMessages([]);
        return;
      }
      const json = (await r.json()) as ConversationThreadResponse;
      setHeader(json.conversation);
      setMessages(json.messages ?? []);
      // після завантаження — позначити як прочитану.
      try {
        await fetch(
          `/api/v1/manager/chat/conversations/${conversationId}/read`,
          { method: "POST", cache: "no-store" },
        );
        onReadCleared();
        // Сповіщаємо верхнє вікно (бейдж «Месенджери» у сайдбарі) миттєво,
        // бо картка/inbox живуть в iframe-вкладці (інакше — затримка polling 30с).
        broadcastChatRead();
      } catch {
        // silent
      }
    } catch {
      setHeader(null);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [conversationId, onReadCleared]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  // Polling нових повідомлень кожні 3с поки вкладка видима.
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const r = await fetch(
          `/api/v1/manager/chat/conversations/${conversationId}`,
          { cache: "no-store" },
        );
        if (!r.ok) return;
        const json = (await r.json()) as ConversationThreadResponse;
        if (cancelled) return;
        setHeader(json.conversation);
        // merge: лишити існуючі + докинути нові за id.
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          const fresh = (json.messages ?? []).filter((m) => !seen.has(m.id));
          if (fresh.length === 0) return prev;
          return [...prev, ...fresh].sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt),
          );
        });
      } catch {
        // silent
      }
    }

    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, POLL_INTERVAL_MS);

    function onVis() {
      if (document.visibilityState === "visible") void poll();
    }
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [conversationId]);

  // Auto-scroll до низу при нових повідомленнях якщо користувач уже знизу.
  useEffect(() => {
    if (!nearBottomRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    nearBottomRef.current = dist < 80;
  }

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    // optimistic
    const tempId = `tmp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      conversationId,
      direction: "out",
      sender: "manager",
      text,
      mediaUrl: null,
      externalMessageId: null,
      authorUserId: null,
      isRead: true,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    nearBottomRef.current = true;
    setDraft("");

    try {
      const r = await fetch(
        `/api/v1/manager/chat/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        },
      );
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Не вдалось надіслати");
      }
      const data = (await r.json()) as SendMessageResponse;
      // замінити optimistic на серверну версію.
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? data.message : m)),
      );
    } catch (e: unknown) {
      // прибрати optimistic + показати помилку.
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(text);
      toast({
        description: e instanceof Error ? e.message : "Помилка",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }, [draft, sending, conversationId, toast]);

  if (loading && !header) {
    return <ThreadSkeleton />;
  }
  if (!header) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        Розмову не знайдено.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 flex-col bg-gray-50">
      <ThreadHeader header={header} showClientLink={showClientLink} />
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 space-y-2 overflow-y-auto px-4 py-3"
      >
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">
            Повідомлень ще немає.
          </p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
      </div>
      <ReplyBox
        value={draft}
        onChange={setDraft}
        onSend={send}
        sending={sending}
      />
    </div>
  );
}

function ThreadHeader({
  header,
  showClientLink,
}: {
  header: ConversationHeader;
  showClientLink: boolean;
}) {
  const platformLabel = chatPlatformLabel(header.platform);
  // У вбудованому (картковому) режимі ім'я клієнта відоме з картки — показуємо
  // платформу як заголовок; у inbox-і — ім'я/лінк на клієнта.
  const primaryName = showClientLink
    ? (header.client?.name ??
      header.externalUserName ??
      header.phone ??
      `#${header.externalUserId.slice(0, 12)}`)
    : platformLabel;

  return (
    <div className="flex items-center gap-3 border-b bg-white px-4 py-2">
      <BrandIcon kind={header.platform} className="h-5 w-5" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {showClientLink && header.client ? (
            <Link
              href={`/manager/customers/${header.client.id}`}
              className="truncate text-sm font-medium text-green-700 hover:underline"
            >
              {primaryName}
            </Link>
          ) : (
            <p className="truncate text-sm font-medium text-gray-800">
              {primaryName}
            </p>
          )}
          {showClientLink && !header.client && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
              Невпізнаний
            </span>
          )}
        </div>
        {header.phone && (
          <p className="text-xs text-gray-500">{header.phone}</p>
        )}
      </div>
      {header.agent && (
        <span className="hidden text-xs text-gray-500 sm:inline">
          Менеджер: {header.agent.fullName}
        </span>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.sender === "system") {
    return (
      <p className="my-1 text-center text-[11px] text-gray-400">
        {message.text}
      </p>
    );
  }
  const isOut = message.direction === "out";
  return (
    <div className={isOut ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isOut
            ? "max-w-[78%] rounded-lg bg-green-600 px-3 py-2 text-sm text-white shadow-sm"
            : "max-w-[78%] rounded-lg bg-white px-3 py-2 text-sm text-gray-800 shadow-sm"
        }
      >
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
        <p
          className={
            isOut
              ? "mt-1 text-right text-[10px] text-green-100"
              : "mt-1 text-right text-[10px] text-gray-400"
          }
          title={new Date(message.createdAt).toLocaleString("uk-UA")}
        >
          {formatRelativeShort(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

function ReplyBox({
  value,
  onChange,
  onSend,
  sending,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
}) {
  const canSend = value.trim().length > 0 && !sending;
  return (
    <div className="border-t bg-white px-3 py-2">
      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, MAX_MESSAGE_LEN))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Напишіть відповідь… (Enter — надіслати, Shift+Enter — новий рядок)"
          rows={2}
          className="flex-1 resize-none"
          maxLength={MAX_MESSAGE_LEN}
        />
        <Button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className="inline-flex items-center gap-1 bg-green-600 hover:bg-green-700"
        >
          <Send className="h-4 w-4" />
          {sending ? "…" : "Надіслати"}
        </Button>
      </div>
    </div>
  );
}

function ThreadSkeleton() {
  return (
    <div className="flex h-full flex-1 flex-col bg-gray-50">
      <div className="h-12 animate-pulse border-b bg-white" />
      <div className="flex-1 space-y-3 px-4 py-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={i % 2 === 0 ? "flex justify-start" : "flex justify-end"}
          >
            <div className="h-10 w-2/3 animate-pulse rounded-lg bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
