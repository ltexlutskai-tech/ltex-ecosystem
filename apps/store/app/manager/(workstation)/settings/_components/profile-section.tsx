"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, useToast } from "@ltex/ui";
import { ChangePasswordModal } from "./change-password-modal";

export function ProfileSection({
  email,
  fullName: initialFullName,
}: {
  email: string;
  fullName: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(initialFullName);
  const [saving, setSaving] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  async function saveName(next: string) {
    const trimmed = next.trim();
    if (trimmed.length < 2) {
      toast({ title: "Мінімум 2 символи", variant: "destructive" });
      setFullName(initialFullName);
      return;
    }
    if (trimmed === initialFullName) return;

    setSaving(true);
    try {
      const res = await fetch("/api/v1/manager/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: trimmed }),
      });
      if (res.ok) {
        toast({ title: "ПІБ оновлено" });
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast({
          title: data.error ?? "Не вдалося оновити",
          variant: "destructive",
        });
        setFullName(initialFullName);
      }
    } catch {
      toast({ title: "Помилка з'єднання", variant: "destructive" });
      setFullName(initialFullName);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-800">Профіль</h2>
      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Email
          </label>
          <div className="text-sm text-gray-600">{email}</div>
        </div>
        <div>
          <label
            htmlFor="profile-fullname"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            ПІБ
          </label>
          <Input
            id="profile-fullname"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            onBlur={(e) => saveName(e.target.value)}
            disabled={saving}
            minLength={2}
            maxLength={120}
          />
        </div>
        <div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPwOpen(true)}
          >
            Змінити пароль
          </Button>
        </div>
      </div>
      <ChangePasswordModal open={pwOpen} onOpenChange={setPwOpen} />
    </section>
  );
}
