"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Input, useToast } from "@ltex/ui";
import { validatePasswordStrength } from "@/lib/auth/password";

export function ResetForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const token = params.get("token") ?? "";
  const invite = params.get("invite") === "true";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const strength = useMemo(
    () => (password ? validatePasswordStrength(password) : { ok: false }),
    [password],
  );
  const mismatch = confirm.length > 0 && confirm !== password;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      toast({ title: "Відсутній токен у посиланні", variant: "destructive" });
      return;
    }
    if (!strength.ok) {
      toast({
        title: strength.reason ?? "Пароль не відповідає вимогам",
        variant: "destructive",
      });
      return;
    }
    if (mismatch) {
      toast({ title: "Паролі не співпадають", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/v1/manager/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (res.ok) {
        toast({
          title: invite ? "Пароль задано" : "Пароль змінено",
          description: "Увійдіть з новим паролем",
        });
        router.push("/manager/login");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast({
        title: data.error ?? "Не вдалося задати пароль",
        variant: "destructive",
      });
    } catch {
      toast({ title: "Помилка з'єднання", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-lg font-semibold text-red-600">
          Посилання недійсне
        </h2>
        <p className="text-sm text-gray-600">
          Відсутній токен. Будь ласка, відкрийте посилання з листа повторно.
        </p>
        <Link
          href="/manager/login"
          className="inline-block text-sm text-green-700 hover:underline"
        >
          Повернутись на вхід
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-800">
          {invite ? "Ласкаво просимо!" : "Скидання пароля"}
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          {invite
            ? "Задайте свій пароль, щоб увійти у L-TEX Manager."
            : "Введіть новий пароль для входу."}
        </p>
      </div>
      <div>
        <label
          htmlFor="password"
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          Новий пароль
        </label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={12}
          required
          disabled={loading}
        />
        {password && !strength.ok && (
          <p className="mt-1 text-xs text-red-600">{strength.reason}</p>
        )}
      </div>
      <div>
        <label
          htmlFor="confirm"
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          Повторіть пароль
        </label>
        <Input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
          disabled={loading}
        />
        {mismatch && (
          <p className="mt-1 text-xs text-red-600">Паролі не співпадають</p>
        )}
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={loading || !strength.ok || mismatch}
      >
        {loading ? "Збереження..." : "Зберегти пароль"}
      </Button>
    </form>
  );
}
