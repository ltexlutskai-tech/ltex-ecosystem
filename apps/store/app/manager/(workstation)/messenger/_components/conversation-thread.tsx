"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Send } from "lucide-react";
import { Button, Textarea, useToast } from "@ltex/ui";
import { formatRelativeShort } from "../../_components/format-relative";
import { Avatar } from "./avatar";
import { GroupInfoDialog } from "./group-info-dialog";
import { roleLabel } from "./role-label";
import type {
  MessengerMessageItem,
  MessengerThreadResponse,
  SendMessageResponse,
} from "./types";

const POLL_INTERVAL_MS = 3_000;
const MAX_MESSAGE_LEN = 4_000;

type Header = MessengerThreadResponse["conversation"];

export function ConversationThread({
  conversationId,
  currentUserId,
  currentUserName,
  onReadCleared,
  onLeft,
}: {
  conversationId: string;
  currentUserId: string;
  currentUserName: string;
  onReadCleared: () => void;
  onLeft: () => void;
}) {
  const [header, setHeader] = useState<Header | null>(null);
  const [messages, setMessages] = useState<MessengerMessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const { toast } = useToast();

  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/v1/manager/messenger/conversations/${conversationId}`,
        { cache: "no-store" },
      );
      if (!r.ok) {
        setHeader(null);
        setMessages([]);
        return;
      }
      const json = (await r.json()) as MessengerThreadResponse;
      setHeader(json.conversation);
      setMessages(json.messages ?? []);
      try {
        await fetch(
          `/api/v1/manager/messenger/conversations/${conversationId}/read`,
          { method: "POST", cache: "no-store" },
        );
        onReadCleared();
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
          `/api/v1/manager/messenger/conversations/${conversationId}`,
          { cache: "no-store" },
        );
        if (!r.ok) return;
        const json = (await r.json()) as MessengerThreadResponse;
        if (cancelled) return;
        setHeader(json.conversation);
        const fresh = json.messages ?? [];
        setMessages((prev) => {
          // Оновлюємо, якщо змінилась кількість або останній id (нове/видалене).
          const prevLast = prev[prev.length - 1]?.id;
          const freshLast = fresh[fresh.length - 1]?.id;
          if (prev.length === fresh.length && prevLast === freshLast) {
            return prev;
          }
          return fresh;
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
    const tempId = `tmp-${Date.now()}`;
    const optimistic: MessengerMessageItem = {
      id: tempId,
      conversationId,
      authorId: null,
      authorName: currentUserName,
      kind: "text",
      text,
      isMine: true,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    nearBottomRef.current = true;
    setDraft("");

    try {
      const r = await fetch(
        `/api/v1/manager/messenger/conversations/${conversationId}/messages`,
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
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? data.message : m)),
      );
    } catch (e: unknown) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(text);
      toast({
        description: e instanceof Error ? e.message : "Помилка",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  }, [draft, sending, conversationId, currentUserName, toast]);

  if (loading && !header) {
    return <ThreadSkeleton />;
  }
  if (!header) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-sm text-gray-500">
        Розмову не знайдено.
      </div>
    );
  }

  const isGroup = header.type === "group";

  return (
    <div className="flex h-full flex-1 flex-col bg-gray-50">
      <ThreadHeader
        header={header}
        onOpenInfo={isGroup ? () => setInfoOpen(true) : undefined}
      />
      {isGroup && (
        <GroupInfoDialog
          open={infoOpen}
          onOpenChange={setInfoOpen}
          conversationId={conversationId}
          header={header}
          currentUserId={currentUserId}
          onChanged={() => void loadInitial()}
          onLeft={onLeft}
        />
      )}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 space-y-1.5 overflow-y-auto px-4 py-3"
      >
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">
            Повідомлень ще немає. Напишіть першим.
          </p>
        ) : (
          messages.map((m) => (
            <MessageBubble key={m.id} message={m} showAuthor={isGroup} />
          ))
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
  onOpenInfo,
}: {
  header: Header;
  onOpenInfo?: () => void;
}) {
  const online =
    header.counterpart?.lastSeenAt != null &&
    Date.now() - new Date(header.counterpart.lastSeenAt).getTime() < 5 * 60_000;

  const subtitle = header.counterpart
    ? online
      ? "У мережі"
      : header.counterpart.lastSeenAt
        ? `Був(ла): ${formatRelativeShort(header.counterpart.lastSeenAt)}`
        : roleLabel(header.counterpart.role)
    : `Учасників: ${header.members.length}`;

  const inner = (
    <>
      <Avatar name={header.title} size="md" />
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-semibold text-gray-800">
          {header.title}
        </p>
        <p className="truncate text-xs text-gray-500">{subtitle}</p>
      </div>
      {onOpenInfo && (
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
      )}
    </>
  );

  if (onOpenInfo) {
    return (
      <button
        type="button"
        onClick={onOpenInfo}
        className="flex w-full items-center gap-3 border-b bg-white px-4 py-2.5 hover:bg-gray-50"
      >
        {inner}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 border-b bg-white px-4 py-2.5">
      {inner}
    </div>
  );
}

function MessageBubble({
  message,
  showAuthor,
}: {
  message: MessengerMessageItem;
  showAuthor: boolean;
}) {
  if (message.kind === "system") {
    return (
      <p className="my-1 text-center text-[11px] text-gray-400">
        {message.text}
      </p>
    );
  }
  const isMine = message.isMine;
  const isDeleted = message.deletedAt !== null;
  return (
    <div className={isMine ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isMine
            ? "max-w-[78%] rounded-lg bg-green-600 px-3 py-2 text-sm text-white shadow-sm"
            : "max-w-[78%] rounded-lg bg-white px-3 py-2 text-sm text-gray-800 shadow-sm"
        }
      >
        {showAuthor && !isMine && message.authorName && (
          <p className="mb-0.5 text-[11px] font-semibold text-green-700">
            {message.authorName}
          </p>
        )}
        <p
          className={
            isDeleted
              ? "whitespace-pre-wrap break-words italic opacity-70"
              : "whitespace-pre-wrap break-words"
          }
        >
          {message.text}
        </p>
        <p
          className={
            isMine
              ? "mt-1 text-right text-[10px] text-green-100"
              : "mt-1 text-right text-[10px] text-gray-400"
          }
          title={new Date(message.createdAt).toLocaleString("uk-UA")}
        >
          {message.editedAt ? "змінено · " : ""}
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
          placeholder="Напишіть повідомлення… (Enter — надіслати, Shift+Enter — новий рядок)"
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
      <div className="h-14 animate-pulse border-b bg-white" />
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
