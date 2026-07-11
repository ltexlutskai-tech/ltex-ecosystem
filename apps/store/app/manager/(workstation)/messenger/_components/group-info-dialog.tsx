"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  LogOut,
  Pencil,
  Plus,
  Search,
  UserMinus,
  X,
} from "lucide-react";
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
  MessengerThreadResponse,
  MessengerUserBrief,
  UsersListResponse,
} from "./types";

type Header = MessengerThreadResponse["conversation"];

async function errorFrom(r: Response): Promise<string> {
  const data = (await r.json().catch(() => ({}))) as { error?: string };
  return data.error ?? "Помилка";
}

export function GroupInfoDialog({
  open,
  onOpenChange,
  conversationId,
  header,
  currentUserId,
  onChanged,
  onLeft,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversationId: string;
  header: Header;
  currentUserId: string;
  onChanged: () => void;
  onLeft: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(header.title);
  const [adding, setAdding] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setRenaming(false);
      setAdding(false);
      setTitleDraft(header.title);
    }
  }, [open, header.title]);

  function err(e: unknown) {
    toast({
      description: e instanceof Error ? e.message : "Помилка",
      variant: "destructive",
    });
  }

  async function saveTitle() {
    if (busy || !titleDraft.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/v1/manager/messenger/conversations/${conversationId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: titleDraft.trim() }),
        },
      );
      if (!r.ok) throw new Error(await errorFrom(r));
      setRenaming(false);
      onChanged();
    } catch (e) {
      err(e);
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(userId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/v1/manager/messenger/conversations/${conversationId}/members/${userId}`,
        { method: "DELETE" },
      );
      if (!r.ok) throw new Error(await errorFrom(r));
      if (userId === currentUserId) {
        onOpenChange(false);
        onLeft();
      } else {
        onChanged();
      }
    } catch (e) {
      err(e);
    } finally {
      setBusy(false);
    }
  }

  if (adding) {
    return (
      <AddMembersDialog
        open={open}
        onOpenChange={onOpenChange}
        conversationId={conversationId}
        existingIds={header.members.map((m) => m.id)}
        onDone={() => {
          setAdding(false);
          onChanged();
        }}
        onBack={() => setAdding(false)}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Про групу</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <Avatar name={header.title} size="lg" />
          {renaming ? (
            <div className="flex flex-1 items-center gap-1">
              <Input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value.slice(0, 100))}
                maxLength={100}
                autoFocus
              />
              <Button
                type="button"
                onClick={saveTitle}
                disabled={busy}
                className="bg-green-600 hover:bg-green-700"
              >
                OK
              </Button>
            </div>
          ) : (
            <div className="flex flex-1 items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-gray-800">
                  {header.title}
                </p>
                <p className="text-xs text-gray-500">
                  Учасників: {header.members.length}
                </p>
              </div>
              {header.canManage && (
                <button
                  type="button"
                  onClick={() => setRenaming(true)}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  aria-label="Перейменувати"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-green-700 hover:bg-gray-50"
        >
          <Plus className="h-4 w-4" />
          Додати учасників
        </button>

        <div className="max-h-[40vh] overflow-y-auto">
          <ul className="divide-y divide-gray-100">
            {header.members.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5 px-1 py-2">
                <Avatar name={m.fullName} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800">
                    {m.fullName}
                    {m.id === currentUserId && " (ви)"}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {roleLabel(m.role)}
                    {m.groupRole === "admin" && (
                      <span className="ml-1 rounded bg-green-100 px-1 text-[10px] text-green-700">
                        адмін
                      </span>
                    )}
                  </p>
                </div>
                {header.canManage && m.id !== currentUserId && (
                  <button
                    type="button"
                    onClick={() => removeMember(m.id)}
                    disabled={busy}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    aria-label="Видалити"
                  >
                    <UserMinus className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => removeMember(currentUserId)}
          disabled={busy}
          className="w-full border-red-200 text-red-600 hover:bg-red-50"
        >
          <LogOut className="mr-1 h-4 w-4" />
          Вийти з групи
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function AddMembersDialog({
  open,
  onOpenChange,
  conversationId,
  existingIds,
  onDone,
  onBack,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversationId: string;
  existingIds: string[];
  onDone: () => void;
  onBack: () => void;
}) {
  const [users, setUsers] = useState<MessengerUserBrief[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/manager/messenger/users", {
        cache: "no-store",
      });
      if (!r.ok) return;
      const json = (await r.json()) as UsersListResponse;
      const existing = new Set(existingIds);
      setUsers((json.users ?? []).filter((u) => !existing.has(u.id)));
    } catch {
      // silent
    }
  }, [existingIds]);

  useEffect(() => {
    setSelected(new Set());
    setSearch("");
    void load();
  }, [load]);

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return u.fullName.toLowerCase().includes(q);
  });

  async function submit() {
    if (busy || selected.size === 0) return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/v1/manager/messenger/conversations/${conversationId}/members`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userIds: [...selected] }),
        },
      );
      if (!r.ok) throw new Error(await errorFrom(r));
      onDone();
    } catch (e) {
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
          <DialogTitle className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="rounded p-0.5 text-gray-400 hover:bg-gray-100"
              aria-label="Назад"
            >
              <X className="h-4 w-4" />
            </button>
            Додати учасників
          </DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук…"
            className="pl-8"
          />
        </div>
        <div className="max-h-[40vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">
              Усі співробітники вже в групі.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((u) => {
                const checked = selected.has(u.id);
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(u.id)) next.delete(u.id);
                          else next.add(u.id);
                          return next;
                        })
                      }
                      className="flex w-full items-center gap-2.5 px-1 py-2 text-left hover:bg-gray-50"
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
                      <span
                        className={
                          checked
                            ? "flex h-5 w-5 items-center justify-center rounded-full bg-green-600 text-white"
                            : "h-5 w-5 rounded-full border border-gray-300"
                        }
                      >
                        {checked && <Check className="h-3.5 w-3.5" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <Button
          type="button"
          onClick={submit}
          disabled={busy || selected.size === 0}
          className="w-full bg-green-600 hover:bg-green-700"
        >
          Додати ({selected.size})
        </Button>
      </DialogContent>
    </Dialog>
  );
}
