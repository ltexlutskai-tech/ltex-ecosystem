"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
  useToast,
} from "@ltex/ui";
import { taskTypeMeta, type TaskCard } from "@/lib/manager/task-types";

interface UserOption {
  id: string;
  fullName: string;
  role: string;
}

const BORDER: Record<string, string> = {
  blue: "border-l-blue-500",
  amber: "border-l-amber-500",
  green: "border-l-green-500",
  gray: "border-l-gray-400",
};
const CHIP: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700",
  amber: "bg-amber-100 text-amber-800",
  green: "bg-green-100 text-green-700",
  gray: "bg-gray-100 text-gray-600",
};

export function TasksClient({
  assignedToMe,
  createdByMe,
  users,
  currentUserId,
}: {
  assignedToMe: TaskCard[];
  createdByMe: TaskCard[];
  users: UserOption[];
  currentUserId: string;
}) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="max-w-none space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Завдання</h1>
          <p className="mt-1 text-sm text-gray-600">
            Доручення між співробітниками + завдання складу від реалізацій.
          </p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          + Створити завдання
        </Button>
      </header>

      <Section
        title="Мені (виконати)"
        empty="Немає активних завдань для вас."
        tasks={assignedToMe}
      />
      <Section
        title="Від мене (я поставив)"
        empty="Ви ще не ставили завдань."
        tasks={createdByMe}
      />

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        users={users.filter((u) => u.id !== currentUserId)}
      />
    </div>
  );
}

function Section({
  title,
  empty,
  tasks,
}: {
  title: string;
  empty: string;
  tasks: TaskCard[];
}) {
  const [showArchived, setShowArchived] = useState(false);
  const active = tasks.filter((t) => t.status !== "archived");
  const archived = tasks.filter((t) => t.status === "archived");

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-gray-700">
        {title}{" "}
        <span className="font-normal text-gray-400">({active.length})</span>
      </h2>
      {active.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400">
          {empty}
        </p>
      ) : (
        <div className="space-y-2">
          {active.map((t) => (
            <TaskRow key={`${t.kind}-${t.id}`} task={t} />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="text-xs font-medium text-gray-500 hover:underline"
          >
            {showArchived ? "▾" : "▸"} Архів ({archived.length})
          </button>
          {showArchived && (
            <div className="mt-2 space-y-2">
              {archived.map((t) => (
                <TaskRow key={`${t.kind}-${t.id}`} task={t} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function TaskRow({ task }: { task: TaskCard }) {
  const router = useRouter();
  const { toast } = useToast();
  const [completeOpen, setCompleteOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const meta = taskTypeMeta(task.type);
  const done = task.status === "done";
  const archived = task.status === "archived";

  async function patch(action: "reopen" | "archive" | "unarchive") {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/manager/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      toast({ title: "Не вдалося виконати дію", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/manager/tasks/${task.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      toast({ title: "Не вдалося вилучити", variant: "destructive" });
      setBusy(false);
    }
  }

  return (
    <div
      className={`rounded-md border border-l-4 bg-white p-3 ${
        BORDER[meta.color] ?? BORDER.gray
      } ${done || archived ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                CHIP[meta.color] ?? CHIP.gray
              }`}
            >
              {meta.label}
            </span>
            <span className="font-medium text-gray-800">{task.title}</span>
            {done && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                Виконано
              </span>
            )}
            {archived && (
              <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600">
                Архів
              </span>
            )}
          </div>
          {task.description && (
            <p className="mt-1 text-sm text-gray-600">{task.description}</p>
          )}
          <p className="mt-1 text-xs text-gray-400">
            Від: {task.createdByName} · Кому: {task.assigneeName}
          </p>
          {archived && task.archivedByName && (
            <p className="mt-1 text-xs text-gray-400">
              в архів: {task.archivedByName}
            </p>
          )}
          {task.resultComment && (
            <p className="mt-1 rounded bg-green-50 p-1.5 text-xs text-green-800">
              Результат: {task.resultComment}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {task.href && (
            <Link
              href={task.href}
              className="text-xs font-medium text-green-700 hover:underline"
            >
              Відкрити →
            </Link>
          )}
          {task.canComplete && (
            <Button
              type="button"
              size="sm"
              onClick={() => setCompleteOpen(true)}
              disabled={busy}
            >
              Виконано
            </Button>
          )}
          {task.canReopen && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => patch("reopen")}
              disabled={busy}
            >
              Перевідкрити
            </Button>
          )}
          {task.canArchive && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => patch("archive")}
              disabled={busy}
            >
              Відправити в архів
            </Button>
          )}
          {task.canUnarchive && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => patch("unarchive")}
              disabled={busy}
            >
              Відновити
            </Button>
          )}
          {task.canDelete &&
            (confirmDelete ? (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={remove}
                  disabled={busy}
                >
                  Так, вилучити
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmDelete(false)}
                  disabled={busy}
                >
                  Скасувати
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
                className="text-red-600"
              >
                Вилучити
              </Button>
            ))}
        </div>
      </div>

      <CompleteDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        taskId={task.id}
      />
    </div>
  );
}

function CompleteDialog({
  open,
  onOpenChange,
  taskId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  taskId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/manager/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          resultComment: comment.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      onOpenChange(false);
      router.refresh();
    } catch {
      toast({ title: "Не вдалося закрити", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Виконати завдання</DialogTitle>
          <DialogDescription>
            Додайте коментар-результат (необовʼязково) — його побачить
            постановник.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={2000}
          placeholder="Напр.: обдзвонив, троє замовили…"
          disabled={busy}
        />
        <DialogFooter>
          <Button type="button" onClick={submit} disabled={busy}>
            {busy ? "Збереження…" : "Позначити виконаним"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateTaskDialog({
  open,
  onOpenChange,
  users,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  users: UserOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!title.trim()) {
      toast({ title: "Вкажіть суть завдання", variant: "destructive" });
      return;
    }
    if (!assignee) {
      toast({ title: "Оберіть виконавця", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim() || undefined,
      };
      if (assignee.startsWith("role:")) {
        body.assigneeRole = assignee.slice("role:".length);
      } else {
        body.assigneeUserId = assignee;
      }
      const res = await fetch("/api/v1/manager/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Помилка");
      }
      setTitle("");
      setDescription("");
      setAssignee("");
      onOpenChange(false);
      router.refresh();
      toast({ title: "Завдання створено" });
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Не вдалося створити",
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
          <DialogTitle>Нове завдання</DialogTitle>
          <DialogDescription>
            Поставте доручення конкретному співробітнику або всьому складу.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Суть завдання
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Напр.: обдзвонити клієнтів по акції"
              disabled={busy}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Опис (необовʼязково)
            </label>
            <Textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              disabled={busy}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Виконавець
            </label>
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              disabled={busy}
              className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
            >
              <option value="">— оберіть —</option>
              <optgroup label="Роль">
                <option value="role:warehouse">Склад (усі складські)</option>
              </optgroup>
              <optgroup label="Співробітник">
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={submit} disabled={busy}>
            {busy ? "Створення…" : "Створити"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
