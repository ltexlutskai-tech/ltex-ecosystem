"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Search, Users } from "lucide-react";
import {
  Button,
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

type Mode = "direct" | "group";

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
  const [mode, setMode] = useState<Mode>("direct");
  const [users, setUsers] = useState<MessengerUserBrief[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
      setMode("direct");
      setSearch("");
      setGroupTitle("");
      setSelected(new Set());
      void load();
    }
  }, [open, load]);

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return u.fullName.toLowerCase().includes(q);
  });

  async function openDirect(userId: string) {
    if (busy) return;
    setBusy(true);
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
      setBusy(false);
    }
  }

  function toggleSelected(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function createGroup() {
    if (busy) return;
    if (!groupTitle.trim()) {
      toast({ description: "Вкажіть назву групи", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/v1/manager/messenger/groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: groupTitle.trim(),
          memberIds: [...selected],
        }),
      });
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Не вдалось створити групу");
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
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "direct" ? "Новий чат" : "Нова група"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 text-sm">
          <ModePill
            active={mode === "direct"}
            onClick={() => setMode("direct")}
            label="Особистий"
          />
          <ModePill
            active={mode === "group"}
            onClick={() => setMode("group")}
            label="Група"
          />
        </div>

        {mode === "group" && (
          <Input
            value={groupTitle}
            onChange={(e) => setGroupTitle(e.target.value.slice(0, 100))}
            placeholder="Назва групи (напр. «Склад»)"
            maxLength={100}
          />
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук співробітника…"
            className="pl-8"
          />
        </div>

        <div className="max-h-[40vh] overflow-y-auto">
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
              {filtered.map((u) => {
                const isChecked = selected.has(u.id);
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() =>
                        mode === "direct"
                          ? openDirect(u.id)
                          : toggleSelected(u.id)
                      }
                      disabled={busy}
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
                      {mode === "group" && (
                        <span
                          className={
                            isChecked
                              ? "flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-white"
                              : "h-5 w-5 rounded-full border border-gray-300"
                          }
                        >
                          {isChecked && <Check className="h-3.5 w-3.5" />}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {mode === "group" && (
          <Button
            type="button"
            onClick={createGroup}
            disabled={busy || !groupTitle.trim()}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            <Users className="mr-1 h-4 w-4" />
            Створити групу ({selected.size})
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ModePill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-green-600 px-3 py-1 text-white"
          : "rounded-full border border-gray-200 px-3 py-1 text-gray-600 hover:bg-gray-50"
      }
    >
      {label}
    </button>
  );
}
