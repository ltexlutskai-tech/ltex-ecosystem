"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  useToast,
} from "@ltex/ui";
import type { ManagerUserRow } from "./users-table";

export function EditUserModal({ user }: { user: ManagerUserRow }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(user.email);
  const [fullName, setFullName] = useState(user.fullName);
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  function reset() {
    setEmail(user.email);
    setFullName(user.fullName);
    setNewPassword("");
  }

  function handleOpenChange(next: boolean) {
    if (next) reset();
    setOpen(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const body: Record<string, unknown> = {};
    const trimmedEmail = email.trim();
    const trimmedName = fullName.trim();
    if (trimmedEmail && trimmedEmail !== user.email) body.email = trimmedEmail;
    if (trimmedName && trimmedName !== user.fullName)
      body.fullName = trimmedName;
    if (newPassword) body.newPassword = newPassword;

    if (Object.keys(body).length === 0) {
      toast({ title: "Немає змін для збереження" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/v1/manager/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast({ title: "Користувача оновлено" });
        setOpen(false);
        router.refresh();
      } else if (res.status === 409) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast({
          title: data.error ?? "Email вже використовується",
          variant: "destructive",
        });
      } else {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast({
          title: data.error ?? "Не вдалося оновити",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Помилка з'єднання", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="secondary"
          disabled={loading}
          className="h-8 px-2 text-xs"
        >
          Редагувати
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Редагувати користувача</DialogTitle>
          <DialogDescription>
            Змінити email, ПІБ або встановити новий пароль. Встановлення пароля
            завершить усі активні сесії користувача.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="edit-email"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Email
            </label>
            <Input
              id="edit-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          <div>
            <label
              htmlFor="edit-fullname"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              ПІБ
            </label>
            <Input
              id="edit-fullname"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              minLength={2}
              disabled={loading}
            />
          </div>
          <div>
            <label
              htmlFor="edit-password"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Новий пароль
            </label>
            <Input
              id="edit-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              disabled={loading}
            />
            <p className="mt-1 text-xs text-gray-500">
              Залишіть порожнім щоб не міняти; мін. 12 символів.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Зберігаємо..." : "Зберегти"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
