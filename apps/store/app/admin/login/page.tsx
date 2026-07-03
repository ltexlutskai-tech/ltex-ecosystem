"use client";

import { useEffect, useState } from "react";
import { Button } from "@ltex/ui";
import { Input } from "@ltex/ui";

const ADMIN_ROLES = new Set(["admin", "owner"]);

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // ?forbidden=1 — the middleware bounced a signed-in non-admin here.
    const params = new URLSearchParams(window.location.search);
    if (params.get("forbidden") === "1") {
      setError("Цей акаунт не має прав адміністратора.");
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/v1/manager/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          setError("Невірний email або пароль");
        } else {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          setError(data?.error ?? "Помилка входу. Спробуйте ще раз.");
        }
        setLoading(false);
        return;
      }

      // Логін ставить cookie для будь-якого активного user — перевіряємо роль.
      const meRes = await fetch("/api/v1/manager/auth/me", {
        cache: "no-store",
      });
      const meData = meRes.ok
        ? ((await meRes.json().catch(() => null)) as {
            user?: { role?: string };
          } | null)
        : null;
      const role = meData?.user?.role;

      if (!role || !ADMIN_ROLES.has(role)) {
        // Не адмін — прибираємо сесію і не пускаємо.
        await fetch("/api/v1/manager/auth/logout", { method: "POST" }).catch(
          () => undefined,
        );
        setError("Немає прав адміністратора");
        setLoading(false);
        return;
      }

      window.location.href = "/admin";
    } catch {
      setError("Помилка мережі. Спробуйте ще раз.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-white p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-green-700">L-TEX</h1>
          <p className="mt-1 text-sm text-gray-500">Адмін-панель</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@ltex.com.ua"
              required
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
              placeholder="********"
              required
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Вхід..." : "Увійти"}
          </Button>
        </form>
      </div>
    </div>
  );
}
