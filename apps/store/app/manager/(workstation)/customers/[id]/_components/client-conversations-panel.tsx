"use client";

import { useCallback, useMemo, useState } from "react";
import { BrandIcon } from "../../../_components/brand-icons";
import { formatRelativeShort } from "../../../_components/format-relative";
import { ConversationThread } from "../../../chat/_components/conversation-thread";
import { getChatPlatformMeta } from "@/lib/chat/platforms";

export interface ClientConversationSummary {
  id: string;
  platform: string;
  externalUserName: string | null;
  phone: string | null;
  unreadForManager: number;
  lastMessageAt: string;
  lastMessagePreview: string | null;
}

/**
 * Вкладка «Повідомлення» картки клієнта — переписка ТІЛЬКИ з цим клієнтом
 * (усі розмови, прив'язані до нього за телефоном). Реюз того самого треду, що
 * й у загальному inbox-і `/manager/chat`, тому вся логіка (polling, надсилання,
 * позначення прочитаним) — спільна.
 *
 * Один канал → одразу тред. Кілька (напр. Telegram + Viber) → перемикач каналів
 * зверху. Порожньо → підказка (клієнт має написати боту).
 */
export function ClientConversationsPanel({
  conversations,
}: {
  conversations: ClientConversationSummary[];
}) {
  const sorted = useMemo(
    () =>
      [...conversations].sort((a, b) =>
        b.lastMessageAt.localeCompare(a.lastMessageAt),
      ),
    [conversations],
  );

  const [selectedId, setSelectedId] = useState<string | null>(
    sorted[0]?.id ?? null,
  );
  // Локальний стан непрочитаних (обнуляємо при відкритті розмови — щоб бейдж
  // у перемикачі каналів зникав миттєво).
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>(() =>
    Object.fromEntries(sorted.map((c) => [c.id, c.unreadForManager])),
  );

  const clearUnread = useCallback((id: string) => {
    setUnreadMap((prev) => (prev[id] ? { ...prev, [id]: 0 } : prev));
  }, []);

  const selected = sorted.find((c) => c.id === selectedId) ?? sorted[0];
  if (!selected) {
    return <EmptyConversations />;
  }
  const selectedMeta = getChatPlatformMeta(selected.platform);

  return (
    <div className="space-y-3">
      {sorted.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {sorted.map((c) => {
            const meta = getChatPlatformMeta(c.platform);
            const active = c.id === selected.id;
            const unread = unreadMap[c.id] ?? 0;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={
                  active
                    ? "inline-flex items-center gap-1.5 rounded-full border border-blue-600 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700"
                    : "inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                }
              >
                <BrandIcon kind={c.platform} className="h-4 w-4" />
                <span>{meta.label}</span>
                <span className="text-[10px] text-gray-400">
                  {formatRelativeShort(c.lastMessageAt)}
                </span>
                {unread > 0 && (
                  <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-medium text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!selectedMeta.outbound && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Відповідь через {selectedMeta.label} ще не підключено — надіслане тут
          збережеться як нотатка, але клієнту поки не доставиться. Робочі канали
          для відповіді: Telegram, Viber.
        </p>
      )}

      <div className="h-[70vh] min-h-[420px] overflow-hidden rounded-lg border bg-white">
        <ConversationThread
          key={selected.id}
          conversationId={selected.id}
          onReadCleared={() => clearUnread(selected.id)}
          showClientLink={false}
        />
      </div>
    </div>
  );
}

function EmptyConversations() {
  return (
    <div className="rounded-lg border border-dashed bg-white p-10 text-center">
      <p className="text-sm font-medium text-gray-700">
        Переписки з цим клієнтом ще немає
      </p>
      <p className="mx-auto mt-2 max-w-md text-xs text-gray-500">
        Розмова з&apos;являється тут автоматично, коли клієнт напише боту L-TEX
        у Telegram або Viber (розмова прив&apos;язується до картки за номером
        телефону). Instagram, Facebook та TikTok підключимо згодом.
      </p>
    </div>
  );
}
