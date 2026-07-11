"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  CornerUpLeft,
  Download,
  FileText,
  Forward,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Send,
  Smile,
  Trash2,
  X,
} from "lucide-react";
import { Button, Textarea, useToast } from "@ltex/ui";
import { ALLOWED_REACTIONS } from "@/lib/messenger/reactions";
import { formatRelativeShort } from "../../_components/format-relative";
import { Avatar } from "./avatar";
import { DocRefCard } from "./doc-ref-card";
import { GroupInfoDialog } from "./group-info-dialog";
import { PickConversationDialog } from "./pick-conversation-dialog";
import { roleLabel } from "./role-label";
import type {
  MessengerAttachmentItem,
  MessengerMessageItem,
  MessengerReplyPreview,
  MessengerThreadResponse,
  SendMessageResponse,
} from "./types";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  return `${(n / (1024 * 1024)).toFixed(1)} МБ`;
}

const POLL_INTERVAL_MS = 3_000;
const MAX_MESSAGE_LEN = 4_000;

type Header = MessengerThreadResponse["conversation"];

async function errorFrom(r: Response): Promise<string> {
  const data = (await r.json().catch(() => ({}))) as { error?: string };
  return data.error ?? "Помилка";
}

export function ConversationThread({
  conversationId,
  currentUserId,
  currentUserName,
  currentUserRole,
  onReadCleared,
  onLeft,
}: {
  conversationId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
  onReadCleared: () => void;
  onLeft: () => void;
}) {
  const [header, setHeader] = useState<Header | null>(null);
  const [messages, setMessages] = useState<MessengerMessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<MessengerMessageItem | null>(
    null,
  );
  const [editing, setEditing] = useState<MessengerMessageItem | null>(null);
  const [forwardSource, setForwardSource] =
    useState<MessengerMessageItem | null>(null);
  const [forwarding, setForwarding] = useState(false);
  const { toast } = useToast();

  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

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

  // Polling — оновлюємо весь набір (щоб бачити редагування/видалення інших).
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
        setMessages(json.messages ?? []);
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

  function startReply(m: MessengerMessageItem) {
    setEditing(null);
    setReplyTarget(m);
  }
  function startEdit(m: MessengerMessageItem) {
    setReplyTarget(null);
    setEditing(m);
    setDraft(m.text);
  }
  function cancelComposerMode() {
    setEditing(null);
    setReplyTarget(null);
    setDraft("");
  }

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);

    // Редагування наявного повідомлення.
    if (editing) {
      try {
        const r = await fetch(
          `/api/v1/manager/messenger/conversations/${conversationId}/messages/${editing.id}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text }),
          },
        );
        if (!r.ok) throw new Error(await errorFrom(r));
        const data = (await r.json()) as SendMessageResponse;
        setMessages((prev) =>
          prev.map((m) => (m.id === editing.id ? data.message : m)),
        );
        cancelComposerMode();
      } catch (e) {
        toast({
          description: e instanceof Error ? e.message : "Помилка",
          variant: "destructive",
        });
      } finally {
        setSending(false);
      }
      return;
    }

    // Нове повідомлення (можливо — відповідь).
    const replyToId = replyTarget?.id;
    const tempId = `tmp-${Date.now()}`;
    const replyPreview: MessengerReplyPreview | null = replyTarget
      ? {
          id: replyTarget.id,
          authorName: replyTarget.authorName,
          preview: replyTarget.text,
        }
      : null;
    const optimistic: MessengerMessageItem = {
      id: tempId,
      conversationId,
      authorId: null,
      authorName: currentUserName,
      kind: "text",
      text,
      isMine: true,
      replyTo: replyPreview,
      attachments: [],
      reactions: [],
      forwardedFrom: null,
      docRef: null,
      pinnedAt: null,
      editedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    nearBottomRef.current = true;
    setDraft("");
    setReplyTarget(null);

    try {
      const r = await fetch(
        `/api/v1/manager/messenger/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, ...(replyToId ? { replyToId } : {}) }),
        },
      );
      if (!r.ok) throw new Error(await errorFrom(r));
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
  }, [
    draft,
    sending,
    editing,
    replyTarget,
    conversationId,
    currentUserName,
    toast,
  ]);

  const doDelete = useCallback(
    async (m: MessengerMessageItem) => {
      try {
        const r = await fetch(
          `/api/v1/manager/messenger/conversations/${conversationId}/messages/${m.id}`,
          { method: "DELETE" },
        );
        if (!r.ok) throw new Error(await errorFrom(r));
        setMessages((prev) =>
          prev.map((x) =>
            x.id === m.id ? { ...x, deletedAt: new Date().toISOString() } : x,
          ),
        );
      } catch (e) {
        toast({
          description: e instanceof Error ? e.message : "Помилка",
          variant: "destructive",
        });
      }
    },
    [conversationId, toast],
  );

  const doReact = useCallback(
    async (m: MessengerMessageItem, emoji: string) => {
      try {
        const r = await fetch(
          `/api/v1/manager/messenger/conversations/${conversationId}/messages/${m.id}/reactions`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ emoji }),
          },
        );
        if (!r.ok) throw new Error(await errorFrom(r));
        const data = (await r.json()) as {
          reactions: MessengerMessageItem["reactions"];
        };
        setMessages((prev) =>
          prev.map((x) =>
            x.id === m.id ? { ...x, reactions: data.reactions } : x,
          ),
        );
      } catch (e) {
        toast({
          description: e instanceof Error ? e.message : "Помилка",
          variant: "destructive",
        });
      }
    },
    [conversationId, toast],
  );

  const doPin = useCallback(
    async (m: MessengerMessageItem) => {
      try {
        const r = await fetch(
          `/api/v1/manager/messenger/conversations/${conversationId}/messages/${m.id}/pin`,
          { method: "POST" },
        );
        if (!r.ok) throw new Error(await errorFrom(r));
        await loadInitial();
      } catch (e) {
        toast({
          description: e instanceof Error ? e.message : "Помилка",
          variant: "destructive",
        });
      }
    },
    [conversationId, loadInitial, toast],
  );

  const doForward = useCallback(
    async (targetConversationId: string) => {
      if (!forwardSource || forwarding) return;
      setForwarding(true);
      try {
        const r = await fetch(
          `/api/v1/manager/messenger/conversations/${conversationId}/messages/${forwardSource.id}/forward`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ toConversationId: targetConversationId }),
          },
        );
        if (!r.ok) throw new Error(await errorFrom(r));
        setForwardSource(null);
        toast({ description: "Переслано ✓" });
      } catch (e) {
        toast({
          description: e instanceof Error ? e.message : "Помилка",
          variant: "destructive",
        });
      } finally {
        setForwarding(false);
      }
    },
    [forwardSource, forwarding, conversationId, toast],
  );

  const uploadFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0 || uploading) return;
      setUploading(true);
      const fd = new FormData();
      const caption = draft.trim();
      if (caption) fd.append("caption", caption);
      Array.from(fileList).forEach((f) => fd.append("files", f));
      try {
        const r = await fetch(
          `/api/v1/manager/messenger/conversations/${conversationId}/attachments`,
          { method: "POST", body: fd },
        );
        if (!r.ok) throw new Error(await errorFrom(r));
        const data = (await r.json()) as SendMessageResponse;
        setMessages((prev) => [...prev, data.message]);
        nearBottomRef.current = true;
        setDraft("");
        setReplyTarget(null);
      } catch (e) {
        toast({
          description: e instanceof Error ? e.message : "Помилка",
          variant: "destructive",
        });
      } finally {
        setUploading(false);
      }
    },
    [conversationId, draft, uploading, toast],
  );

  if (loading && !header) return <ThreadSkeleton />;
  if (!header) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-sm text-gray-500">
        Розмову не знайдено.
      </div>
    );
  }

  const isGroup = header.type === "group";
  const isOwner = currentUserRole === "owner";

  return (
    <div className="flex h-full flex-1 flex-col bg-gray-50">
      <ThreadHeader
        header={header}
        onOpenInfo={isGroup ? () => setInfoOpen(true) : undefined}
      />
      {header.pinned.length > 0 && (
        <PinnedBar pinned={header.pinned} onUnpin={doPin} />
      )}
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
      <PickConversationDialog
        open={forwardSource !== null}
        onOpenChange={(v) => {
          if (!v) setForwardSource(null);
        }}
        title="Переслати повідомлення"
        busy={forwarding}
        onPick={doForward}
      />
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
            <MessageBubble
              key={m.id}
              message={m}
              showAuthor={isGroup}
              canManage={header.canManage}
              isOwner={isOwner}
              onReply={startReply}
              onEdit={startEdit}
              onDelete={doDelete}
              onReact={doReact}
              onForward={setForwardSource}
              onPin={doPin}
            />
          ))
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.xlsx,.xls,.docx,.doc,.csv,.txt"
        className="hidden"
        onChange={(e) => {
          void uploadFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <Composer
        value={draft}
        onChange={setDraft}
        onSend={submit}
        sending={sending}
        editing={editing !== null}
        replyTarget={replyTarget}
        onCancelMode={cancelComposerMode}
        uploading={uploading}
        onAttach={() => fileInputRef.current?.click()}
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
  canManage,
  isOwner,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onForward,
  onPin,
}: {
  message: MessengerMessageItem;
  showAuthor: boolean;
  canManage: boolean;
  isOwner: boolean;
  onReply: (m: MessengerMessageItem) => void;
  onEdit: (m: MessengerMessageItem) => void;
  onDelete: (m: MessengerMessageItem) => void;
  onReact: (m: MessengerMessageItem, emoji: string) => void;
  onForward: (m: MessengerMessageItem) => void;
  onPin: (m: MessengerMessageItem) => void;
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
  const canReply = !isDeleted;
  const canEdit = isMine && !isDeleted;
  const canDelete = !isDeleted && (isMine || canManage || isOwner);
  const canReact = !isDeleted;
  const canForward = !isDeleted;
  const isPinned = message.pinnedAt !== null;

  return (
    <div className={`group flex ${isMine ? "justify-end" : "justify-start"}`}>
      {/* Дії (зліва для своїх, справа для чужих) */}
      {isMine && !isDeleted && (
        <BubbleActions
          message={message}
          canReply={canReply}
          canEdit={canEdit}
          canDelete={canDelete}
          canReact={canReact}
          canForward={canForward}
          isPinned={isPinned}
          onReply={onReply}
          onEdit={onEdit}
          onDelete={onDelete}
          onReact={onReact}
          onForward={onForward}
          onPin={onPin}
        />
      )}
      <div
        className={
          isMine
            ? "max-w-[78%] rounded-lg bg-green-600 px-3 py-2 text-sm text-white shadow-sm"
            : "max-w-[78%] rounded-lg bg-white px-3 py-2 text-sm text-gray-800 shadow-sm"
        }
      >
        {isPinned && !isDeleted && (
          <p
            className={
              isMine
                ? "mb-0.5 flex items-center gap-1 text-[10px] text-green-100"
                : "mb-0.5 flex items-center gap-1 text-[10px] text-gray-400"
            }
          >
            <Pin className="h-3 w-3" />
            Закріплено
          </p>
        )}
        {showAuthor && !isMine && message.authorName && (
          <p className="mb-0.5 text-[11px] font-semibold text-green-700">
            {message.authorName}
          </p>
        )}
        {message.forwardedFrom && !isDeleted && (
          <p
            className={
              isMine
                ? "mb-0.5 flex items-center gap-1 text-[11px] italic text-green-100"
                : "mb-0.5 flex items-center gap-1 text-[11px] italic text-gray-400"
            }
          >
            <Forward className="h-3 w-3" />
            Переслано від {message.forwardedFrom}
          </p>
        )}
        {message.docRef && !isDeleted && (
          <DocRefCard docRef={message.docRef} isMine={isMine} />
        )}
        {message.replyTo && (
          <div
            className={
              isMine
                ? "mb-1 border-l-2 border-green-200 pl-2 text-[11px] text-green-50"
                : "mb-1 border-l-2 border-gray-300 pl-2 text-[11px] text-gray-500"
            }
          >
            <span className="font-semibold">
              {message.replyTo.authorName ?? "Повідомлення"}
            </span>
            <span className="ml-1 opacity-90">{message.replyTo.preview}</span>
          </div>
        )}
        {message.attachments.length > 0 && (
          <AttachmentList attachments={message.attachments} isMine={isMine} />
        )}
        {(message.text || isDeleted) && (
          <p
            className={
              isDeleted
                ? "whitespace-pre-wrap break-words italic opacity-70"
                : "whitespace-pre-wrap break-words"
            }
          >
            {message.text}
          </p>
        )}
        {message.reactions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {message.reactions.map((rx) => (
              <button
                key={rx.emoji}
                type="button"
                onClick={() => onReact(message, rx.emoji)}
                className={
                  rx.mine
                    ? "inline-flex items-center gap-0.5 rounded-full border border-white/40 bg-white/25 px-1.5 py-0.5 text-[11px]"
                    : isMine
                      ? "inline-flex items-center gap-0.5 rounded-full bg-white/15 px-1.5 py-0.5 text-[11px]"
                      : "inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700"
                }
              >
                <span>{rx.emoji}</span>
                <span>{rx.count}</span>
              </button>
            ))}
          </div>
        )}
        <p
          className={
            isMine
              ? "mt-1 text-right text-[10px] text-green-100"
              : "mt-1 text-right text-[10px] text-gray-400"
          }
          title={new Date(message.createdAt).toLocaleString("uk-UA")}
        >
          {message.editedAt && !isDeleted ? "змінено · " : ""}
          {formatRelativeShort(message.createdAt)}
        </p>
      </div>
      {!isMine && !isDeleted && (
        <BubbleActions
          message={message}
          canReply={canReply}
          canEdit={canEdit}
          canDelete={canDelete}
          canReact={canReact}
          canForward={canForward}
          isPinned={isPinned}
          onReply={onReply}
          onEdit={onEdit}
          onDelete={onDelete}
          onReact={onReact}
          onForward={onForward}
          onPin={onPin}
        />
      )}
    </div>
  );
}

function AttachmentList({
  attachments,
  isMine,
}: {
  attachments: MessengerAttachmentItem[];
  isMine: boolean;
}) {
  const images = attachments.filter((a) => a.kind === "image");
  const files = attachments.filter((a) => a.kind === "file");
  return (
    <div className="mb-1 space-y-1">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {images.map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-md"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt={a.name}
                className="max-h-52 max-w-[220px] rounded-md object-cover"
                loading="lazy"
              />
            </a>
          ))}
        </div>
      )}
      {files.map((a) => (
        <a
          key={a.id}
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          download={a.name}
          className={
            isMine
              ? "flex items-center gap-2 rounded-md bg-green-700/40 px-2 py-1.5 text-xs hover:bg-green-700/60"
              : "flex items-center gap-2 rounded-md bg-gray-100 px-2 py-1.5 text-xs hover:bg-gray-200"
          }
        >
          <FileText className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{a.name}</span>
            <span className={isMine ? "text-green-100" : "text-gray-500"}>
              {formatBytes(a.sizeBytes)}
            </span>
          </span>
          <Download className="h-4 w-4 shrink-0 opacity-70" />
        </a>
      ))}
    </div>
  );
}

function BubbleActions({
  message,
  canReply,
  canEdit,
  canDelete,
  canReact,
  canForward,
  isPinned,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onForward,
  onPin,
}: {
  message: MessengerMessageItem;
  canReply: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canReact: boolean;
  canForward: boolean;
  isPinned: boolean;
  onReply: (m: MessengerMessageItem) => void;
  onEdit: (m: MessengerMessageItem) => void;
  onDelete: (m: MessengerMessageItem) => void;
  onReact: (m: MessengerMessageItem, emoji: string) => void;
  onForward: (m: MessengerMessageItem) => void;
  onPin: (m: MessengerMessageItem) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 self-center px-1 opacity-0 transition group-hover:opacity-100">
      {canReact && <ReactButton onPick={(emoji) => onReact(message, emoji)} />}
      {canReply && (
        <IconBtn label="Відповісти" onClick={() => onReply(message)}>
          <CornerUpLeft className="h-3.5 w-3.5" />
        </IconBtn>
      )}
      {canForward && (
        <IconBtn label="Переслати" onClick={() => onForward(message)}>
          <Forward className="h-3.5 w-3.5" />
        </IconBtn>
      )}
      <IconBtn
        label={isPinned ? "Відкріпити" : "Закріпити"}
        onClick={() => onPin(message)}
      >
        {isPinned ? (
          <PinOff className="h-3.5 w-3.5" />
        ) : (
          <Pin className="h-3.5 w-3.5" />
        )}
      </IconBtn>
      {canEdit && (
        <IconBtn label="Редагувати" onClick={() => onEdit(message)}>
          <Pencil className="h-3.5 w-3.5" />
        </IconBtn>
      )}
      {canDelete && (
        <IconBtn label="Видалити" onClick={() => onDelete(message)}>
          <Trash2 className="h-3.5 w-3.5" />
        </IconBtn>
      )}
    </div>
  );
}

function PinnedBar({
  pinned,
  onUnpin,
}: {
  pinned: MessengerMessageItem[];
  onUnpin: (m: MessengerMessageItem) => void;
}) {
  const latest = pinned[0];
  if (!latest) return null;
  const preview =
    latest.text ||
    (latest.attachments.length > 0
      ? latest.attachments.some((a) => a.kind === "image")
        ? "📷 Фото"
        : "📎 Файл"
      : latest.docRef
        ? `📎 ${latest.docRef.label}`
        : "Повідомлення");
  return (
    <div className="flex items-center gap-2 border-b bg-amber-50 px-4 py-1.5 text-xs">
      <Pin className="h-3.5 w-3.5 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1">
        <span className="font-medium text-amber-800">Закріплене</span>
        {pinned.length > 1 && (
          <span className="ml-1 text-amber-600">(+{pinned.length - 1})</span>
        )}
        <span className="ml-2 text-gray-600">
          {latest.authorName ? `${latest.authorName}: ` : ""}
          {preview}
        </span>
      </div>
      <button
        type="button"
        onClick={() => onUnpin(latest)}
        aria-label="Відкріпити"
        title="Відкріпити"
        className="rounded p-1 text-amber-600 hover:bg-amber-100"
      >
        <PinOff className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ReactButton({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <IconBtn label="Реакція" onClick={() => setOpen((v) => !v)}>
        <Smile className="h-3.5 w-3.5" />
      </IconBtn>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute bottom-full z-20 mb-1 flex gap-0.5 rounded-full border bg-white px-1.5 py-1 shadow-md">
            {ALLOWED_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onPick(emoji);
                  setOpen(false);
                }}
                className="rounded-full px-1 text-base leading-none hover:bg-gray-100"
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
    >
      {children}
    </button>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  sending,
  editing,
  replyTarget,
  onCancelMode,
  uploading,
  onAttach,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  editing: boolean;
  replyTarget: MessengerMessageItem | null;
  onCancelMode: () => void;
  uploading: boolean;
  onAttach: () => void;
}) {
  const canSend = value.trim().length > 0 && !sending;
  return (
    <div className="border-t bg-white px-3 py-2">
      {(editing || replyTarget) && (
        <div className="mb-1.5 flex items-start gap-2 rounded bg-gray-100 px-2 py-1 text-xs">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-green-700">
              {editing
                ? "Редагування повідомлення"
                : `Відповідь · ${replyTarget?.authorName ?? ""}`}
            </p>
            {replyTarget && (
              <p className="truncate text-gray-500">{replyTarget.text}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onCancelMode}
            aria-label="Скасувати"
            className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        {!editing && (
          <button
            type="button"
            onClick={onAttach}
            disabled={uploading}
            aria-label="Прикріпити файл"
            title="Прикріпити фото або файл"
            className="mb-0.5 rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-green-700 disabled:opacity-50"
          >
            <Paperclip className="h-5 w-5" />
          </button>
        )}
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, MAX_MESSAGE_LEN))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
            if (e.key === "Escape" && (editing || replyTarget)) {
              onCancelMode();
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
          {sending ? "…" : editing ? "Зберегти" : "Надіслати"}
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
