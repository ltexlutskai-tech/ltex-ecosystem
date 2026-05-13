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
  Input,
  useToast,
} from "@ltex/ui";

function validateNew(plain: string): string | null {
  if (plain.length < 12) return "Мінімум 12 символів";
  if (!/[0-9]/.test(plain)) return "Хоча б одна цифра";
  if (!/[A-Za-zА-Яа-яҐІЇЄ]/.test(plain)) return "Хоча б одна буква";
  return null;
}

export function ChangePasswordModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateNew(next);
    if (err) {
      toast({ title: err, variant: "destructive" });
      return;
    }
    if (next !== confirm) {
      toast({ title: "Паролі не збігаються", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/manager/me/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: current,
          newPassword: next,
        }),
      });
      if (res.status === 204) {
        toast({
          title: "Пароль змінено",
          description: "Усі інші сесії завершено.",
        });
        reset();
        onOpenChange(false);
        router.refresh();
      } else if (res.status === 401) {
        toast({
          title: "Поточний пароль невірний",
          variant: "destructive",
        });
      } else {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast({
          title: data.error ?? "Не вдалося змінити пароль",
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
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Змінити пароль</DialogTitle>
          <DialogDescription>
            Після зміни паролю всі активні сесії буде завершено.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="pw-current"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Поточний пароль
            </label>
            <Input
              id="pw-current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
              disabled={loading}
            />
          </div>
          <div>
            <label
              htmlFor="pw-new"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Новий пароль
            </label>
            <Input
              id="pw-new"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              minLength={12}
              required
              disabled={loading}
            />
            <p className="mt-1 text-xs text-gray-500">
              Мінімум 12 символів, хоча б одна цифра та літера.
            </p>
          </div>
          <div>
            <label
              htmlFor="pw-confirm"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Підтвердження
            </label>
            <Input
              id="pw-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              disabled={loading}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Скасувати
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Збереження..." : "Зберегти"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
