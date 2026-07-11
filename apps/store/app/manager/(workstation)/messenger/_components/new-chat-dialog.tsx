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
  MessengerUserBrief,
  OpenChatResponse,
  UsersListResponse,
} from "./types";

export function NewChatDialog({
  open,
  onOpenChange,
  onOpened,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentUserId: string;
  onOpened: (conversationId: string) => void;
}) {
  const [users, setUsers] = useState<MessengerUserBrief[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/v1/manager/messenger/users", {
        cache: "no-store",
      });
      if (!r.ok) return;
      const json = (await r.json()) as UsersListResponse;
      setUsers(json.users ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setSearch("");
      void load();
    }
  }, [open, load]);

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return u.fullName.toLowerCase().includes(q);
  });

  async function openChat(userId: string) {
    if (opening) return;
    setOpening(userId);
    try {
      const r = await fetch("/api/v1/manager/messenger/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Не вдалось відкрити чат");
      }
      const data = (await r.json()) as OpenChatResponse;
      onOpenChange(false);
      onOpened(data.conversationId);
    } catch (e: unknown) {
      toast({
        description: e instanceof Error ? e.message : "Помилка",
        variant: "destructive",
      });
    } finally {
      setOpening(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Новий чат</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук співробітника…"
            className="pl-8"
            autoFocus
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-sm text-gray-400">
              Завантаження…
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              Співробітників не знайдено.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => openChat(u.id)}
                    disabled={opening !== null}
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
                    {opening === u.id && (
                      <span className="text-xs text-gray-400">…</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
