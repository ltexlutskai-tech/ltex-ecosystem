"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input, useToast } from "@ltex/ui";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/v1/manager/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Мобільні клавіатури часто додають пробіл/велику літеру в email —
        // нормалізуємо, щоб вхід не падав через це. Пароль НЕ чіпаємо.
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      if (res.ok) {
        router.push("/manager");
        router.refresh();
        return;
      }
      if (res.status === 401) {
        toast({
          title: "Невірний email або пароль",
          variant: "destructive",
        });
      } else if (res.status === 403) {
        toast({
          title: "Обліковий запис вимкнено",
          variant: "destructive",
        });
      } else if (res.status === 423) {
        toast({
          title: "Обліковий запис тимчасово заблоковано на 15 хв",
          variant: "destructive",
        });
      } else if (res.status === 429) {
        toast({
          title: "Забагато спроб. Спробуйте за хвилину.",
          variant: "destructive",
        });
      } else {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast({
          title: data.error ?? "Сталася помилка",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Помилка з'єднання",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="email"
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          Email
        </label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          disabled={loading}
        />
      </div>
      <div>
        <label
          htmlFor="password"
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          Пароль
        </label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          disabled={loading}
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Вхід..." : "Увійти"}
      </Button>
      <p className="text-center text-sm text-gray-500">
        <Link href="/manager/forgot" className="text-green-700 hover:underline">
          Забули пароль?
        </Link>
      </p>
    </form>
  );
}
