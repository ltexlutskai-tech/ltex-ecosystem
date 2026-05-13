"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@ltex/ui";

export function RevokeSessionButton({
  id,
  isCurrent,
}: {
  id: string;
  isCurrent: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    const label = isCurrent ? "цю (поточну) сесію" : "цю сесію";
    if (!confirm(`Завершити ${label}?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/manager/me/sessions/${id}`, {
        method: "DELETE",
      });
      if (res.status === 204 || res.ok) {
        if (isCurrent) {
          toast({ title: "Сесію завершено" });
          router.push("/manager/login");
          router.refresh();
        } else {
          toast({ title: "Сесію завершено" });
          router.refresh();
        }
      } else {
        toast({
          title: "Не вдалося завершити сесію",
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
    <Button
      type="button"
      variant="secondary"
      onClick={handleClick}
      disabled={loading}
      className="h-8 px-3 text-xs"
    >
      {loading ? "..." : "Завершити"}
    </Button>
  );
}

export function RevokeAllOthersButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (
      !confirm(
        "Завершити всі сесії, окрім поточної? Доведеться знову увійти на інших пристроях.",
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/v1/manager/auth/logout?everywhere=true", {
        method: "POST",
      });
      if (res.ok) {
        toast({ title: "Усі сесії завершено" });
        router.push("/manager/login");
        router.refresh();
      } else {
        toast({
          title: "Не вдалося завершити сесії",
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
    <Button
      type="button"
      variant="secondary"
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? "..." : "Завершити всі інші"}
    </Button>
  );
}
