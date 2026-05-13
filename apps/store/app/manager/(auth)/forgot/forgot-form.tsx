"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Input, useToast } from "@ltex/ui";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/v1/manager/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 202) {
        setDone(true);
      } else if (res.status === 429) {
        toast({
          title: "Забагато спроб. Спробуйте пізніше.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Не вдалося надіслати запит",
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

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-lg font-semibold text-green-700">
          Перевірте пошту
        </h2>
        <p className="text-sm text-gray-600">
          Якщо обліковий запис існує — ми надіслали посилання для скидання
          пароля на вказаний email. Посилання дійсне 1 годину.
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
      <p className="text-sm text-gray-600">
        Вкажіть email від облікового запису, і ми надішлемо посилання для
        скидання пароля.
      </p>
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
          autoComplete="email"
          required
          disabled={loading}
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Надсилаємо..." : "Надіслати посилання"}
      </Button>
      <p className="text-center text-sm text-gray-500">
        <Link href="/manager/login" className="text-green-700 hover:underline">
          Повернутись на вхід
        </Link>
      </p>
    </form>
  );
}
