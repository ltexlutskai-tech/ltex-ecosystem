"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button, useToast } from "@ltex/ui";

export interface RegionAgentRow {
  id: string;
  region: string;
  regionLabel: string;
  userId: string;
  userFullName: string;
  userEmail: string;
  userRole: string;
}

interface UserOption {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

interface RegionOption {
  slug: string;
  label: string;
}

const BASE = "/api/v1/manager/admin/region-agents";

const ROLE_LABELS: Record<string, string> = {
  manager: "Менеджер",
  senior_manager: "Старший менеджер",
  admin: "Адміністратор",
};

export function RegionAgentsManager({
  initial,
  availableRegions,
  users,
}: {
  initial: RegionAgentRow[];
  availableRegions: readonly RegionOption[];
  users: UserOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [newRegion, setNewRegion] = useState<string>(
    availableRegions[0]?.slug ?? "",
  );
  const [newUserId, setNewUserId] = useState<string>(users[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  async function call(
    url: string,
    method: string,
    body?: unknown,
  ): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        ...(body !== undefined
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast({ title: j.error ?? "Помилка", variant: "destructive" });
        return false;
      }
      startTransition(() => router.refresh());
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!newRegion || !newUserId) {
      toast({ title: "Виберіть область і менеджера", variant: "destructive" });
      return;
    }
    const ok = await call(BASE, "POST", {
      region: newRegion,
      userId: newUserId,
    });
    if (ok) {
      // Скидаємо до першої вільної (після refresh useState не оновиться сам).
    }
  }

  async function changeManager(id: string, userId: string) {
    await call(`${BASE}/${id}`, "PATCH", { userId });
  }

  async function remove(id: string) {
    if (!confirm("Видалити запис мапи?")) return;
    await call(`${BASE}/${id}`, "DELETE");
  }

  return (
    <div className="space-y-4">
      {/* Форма додавання */}
      <div className="space-y-3 rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-700">
          Призначити менеджера області
        </h2>
        {availableRegions.length === 0 ? (
          <p className="text-sm text-gray-500">
            Усі 24 області вже призначені. Щоб змінити менеджера — використайте
            випадаючий список у таблиці нижче.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-gray-600">Область</span>
                <select
                  value={newRegion}
                  onChange={(e) => setNewRegion(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                >
                  {availableRegions.map((r) => (
                    <option key={r.slug} value={r.slug}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-gray-600">Менеджер</span>
                <select
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                >
                  {users.length === 0 ? (
                    <option value="" disabled>
                      Немає активних менеджерів
                    </option>
                  ) : (
                    users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({ROLE_LABELS[u.role] ?? u.role})
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>
            <Button
              type="button"
              onClick={create}
              disabled={busy || pending || !newRegion || !newUserId}
              className="bg-green-600 hover:bg-green-700"
              size="sm"
            >
              <Plus className="mr-1 h-4 w-4" />
              Додати
            </Button>
          </>
        )}
      </div>

      {/* Список */}
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Область</th>
              <th className="px-4 py-2 font-medium">Менеджер</th>
              <th className="px-4 py-2 text-right font-medium">Дії</th>
            </tr>
          </thead>
          <tbody>
            {initial.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                  Жодна область поки не прив'язана. Нові клієнти за областю
                  потраплятимуть у «без менеджера».
                </td>
              </tr>
            )}
            {initial.map((row) => (
              <tr key={row.id} className="border-b last:border-b-0">
                <td className="px-4 py-2 font-medium text-gray-800">
                  {row.regionLabel}
                </td>
                <td className="px-4 py-2 text-gray-700">
                  <select
                    value={row.userId}
                    disabled={busy}
                    onChange={(e) => changeManager(row.id, e.target.value)}
                    className="w-full max-w-xs rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-green-500 focus:outline-none"
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({ROLE_LABELS[u.role] ?? u.role})
                      </option>
                    ))}
                    {/* Захист — якщо поточний user не в списку active, показуємо плейсхолдер */}
                    {!users.find((u) => u.id === row.userId) && (
                      <option value={row.userId}>
                        {row.userFullName} (неактивний)
                      </option>
                    )}
                  </select>
                </td>
                <td className="px-4 py-2 text-right">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => remove(row.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
