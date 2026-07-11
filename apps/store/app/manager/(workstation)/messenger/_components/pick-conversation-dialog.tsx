"use client";

import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  useToast,
} from "@ltex/ui";
import { Avatar } from "./avatar";
import { roleLabel } from "./role-label";
import type {
  ConversationsListResponse,
  MessengerConversationListItem,
  MessengerUserBrief,
  OpenChatResponse,
  UsersListResponse,
} from "./types";

/**
 * Діалог вибору цільової розмови — для пересилання та кнопки «Обговорити».
 * Дозволяє обрати наявну розмову АБО почати особистий чат зі співробітником.
 * Повертає id обраної (за потреби — щойно створеної) розмови через `onPick`.
 */
export function PickConversationDialog({
  open,
  onOpenChange,
  title,
  busy,
  onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  busy: boolean;
  onPick: (conversationId: string) => void;
}) {
  const [conversations, setConversations] = useState<
    MessengerConversationListItem[]
  >([]);
  const [users, setUsers] = useState<MessengerUserBrief[]>([]);
  const [search, setSearch] = useState("");
  const [starting, setStarting] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const [cr, ur] = await Promise.all([
        fetch("/api/v1/manager/messenger/conversations", {
          cache: "no-store",
        }),
        fetch("/api/v1/manager/messenger/users", { cache: "no-store" }),
      ]);
      if (cr.ok) {
        const j = (await cr.json()) as ConversationsListResponse;
        setConversations(j.conversations ?? []);
      }
      if (ur.ok) {
        const j = (await ur.json()) as UsersListResponse;
        setUsers(j.users ?? []);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (open) {
      setSearch("");
      void load();
    }
  }, [open, load]);

  const q = search.trim().toLowerCase();
  const convs = conversations.filter((c) => c.title.toLowerCase().includes(q));
  const people = users.filter((u) => u.fullName.toLowerCase().includes(q));

  async function startDirect(userId: string) {
    if (starting || busy) return;
    setStarting(true);
    try {
      const r = await fetch("/api/v1/manager/messenger/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Помилка");
      }
      const d = (await r.json()) as OpenChatResponse;
      onPick(d.conversationId);
    } catch (e) {
      toast({
        description: e instanceof Error ? e.message : "Помилка",
        variant: "destructive",
      });
    } finally {
      setStarting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук розмови або співробітника…"
            className="pl-8"
          />
        </div>
        <div className="max-h-[50vh] space-y-3 overflow-y-auto">
          {convs.length > 0 && (
            <div>
              <p className="px-1 pb-1 text-xs font-medium uppercase text-gray-400">
                Розмови
              </p>
              <ul className="divide-y divide-gray-100">
                {convs.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={busy || starting}
                      onClick={() => onPick(c.id)}
                      className="flex w-full items-center gap-2.5 px-1 py-2 text-left hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Avatar name={c.title} size="md" />
                      <span className="truncate text-sm font-medium text-gray-800">
                        {c.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {people.length > 0 && (
            <div>
              <p className="px-1 pb-1 text-xs font-medium uppercase text-gray-400">
                Співробітники
              </p>
              <ul className="divide-y divide-gray-100">
                {people.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      disabled={busy || starting}
                      onClick={() => startDirect(u.id)}
                      className="flex w-full items-center gap-2.5 px-1 py-2 text-left hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Avatar name={u.fullName} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-800">
                          {u.fullName}
                        </p>
                        <p className="truncate text-xs text-gray-500">
                          {roleLabel(u.role)}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {convs.length === 0 && people.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-500">
              Нічого не знайдено.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
