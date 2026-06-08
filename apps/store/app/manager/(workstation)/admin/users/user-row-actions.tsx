"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@ltex/ui";
import type { ManagerUserRow } from "./users-table";

type Role =
  | "manager"
  | "senior_manager"
  | "admin"
  | "owner"
  | "supervisor"
  | "analyst"
  | "warehouse"
  | "bookkeeper";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "manager", label: "Менеджер" },
  { value: "senior_manager", label: "Старший менеджер" },
  { value: "admin", label: "Адміністратор" },
  { value: "owner", label: "Власник" },
  { value: "supervisor", label: "Супервайзер" },
  { value: "analyst", label: "Аналітик" },
  { value: "warehouse", label: "Склад" },
  { value: "bookkeeper", label: "Бухгалтер" },
];

export function UserRowActions({
  user,
  isSelf,
}: {
  user: ManagerUserRow;
  isSelf: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function patch(
    body: Record<string, unknown>,
    successMessage: string,
  ): Promise<void> {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/manager/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast({ title: successMessage });
        router.refresh();
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

  function handleRoleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const role = e.target.value as Role;
    if (role === user.role) return;
    patch({ role }, "Роль оновлено");
  }

  function handleToggleActive() {
    patch(
      { isActive: !user.isActive },
      user.isActive ? "Користувача вимкнено" : "Користувача активовано",
    );
  }

  function handleForceReset() {
    if (
      !confirm(
        `Скинути пароль для ${user.email}? Усі активні сесії буде завершено.`,
      )
    ) {
      return;
    }
    patch({ forcePasswordReset: true }, "Лист зі скиданням надіслано");
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <select
        value={user.role}
        onChange={handleRoleChange}
        disabled={loading || isSelf}
        className="h-8 rounded border border-input bg-white px-2 text-xs"
        aria-label="Роль"
      >
        {ROLE_OPTIONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="secondary"
        onClick={handleForceReset}
        disabled={loading}
        className="h-8 px-2 text-xs"
      >
        Скинути пароль
      </Button>
      <Button
        type="button"
        variant={user.isActive ? "destructive" : "default"}
        onClick={handleToggleActive}
        disabled={loading || isSelf}
        className="h-8 px-2 text-xs"
      >
        {user.isActive ? "Вимкнути" : "Активувати"}
      </Button>
    </div>
  );
}
