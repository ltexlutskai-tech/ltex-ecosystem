"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, Pencil } from "lucide-react";
import { Button, Input, useToast } from "@ltex/ui";

export interface BankAccountItem {
  id: string;
  name: string;
  description: string | null;
  hiddenInApp: boolean;
  archived: boolean;
}

const BASE = "/api/v1/manager/admin/bank-accounts";

export function BankAccountsManager({
  initial,
}: {
  initial: BankAccountItem[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [hiddenInApp, setHiddenInApp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  async function call(url: string, method: string, body: unknown) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
    if (!name.trim()) return;
    const ok = await call(BASE, "POST", {
      name: name.trim(),
      description: description.trim() || undefined,
      hiddenInApp,
    });
    if (ok) {
      setName("");
      setDescription("");
      setHiddenInApp(false);
    }
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    const ok = await call(`${BASE}/${id}`, "PATCH", { name: editName.trim() });
    if (ok) setEditingId(null);
  }

  return (
    <div className="space-y-4">
      {/* Форма додавання */}
      <div className="space-y-3 rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-700">Додати рахунок</h2>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Назва / IBAN / № рахунку"
        />
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Опис (необов'язково)"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={hiddenInApp}
            onChange={(e) => setHiddenInApp(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
          />
          Прихований (не пропонувати при приході)
        </label>
        <Button
          type="button"
          onClick={create}
          disabled={busy || pending || !name.trim()}
          className="bg-green-600 hover:bg-green-700"
          size="sm"
        >
          <Plus className="mr-1 h-4 w-4" />
          Додати
        </Button>
      </div>

      {/* Список */}
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Назва</th>
              <th className="px-4 py-2 font-medium">Опис</th>
              <th className="px-4 py-2 text-center font-medium">Прихований</th>
              <th className="px-4 py-2 text-right font-medium">Дії</th>
            </tr>
          </thead>
          <tbody>
            {initial.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  Немає рахунків.
                </td>
              </tr>
            )}
            {initial.map((b) => (
              <tr
                key={b.id}
                className={`border-b last:border-b-0 ${
                  b.archived ? "bg-gray-50 text-gray-400" : ""
                }`}
              >
                <td className="px-4 py-2 font-medium text-gray-800">
                  {editingId === b.id ? (
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-8"
                    />
                  ) : (
                    b.name
                  )}
                </td>
                <td className="px-4 py-2 text-gray-600">
                  {b.description ?? "—"}
                </td>
                <td className="px-4 py-2 text-center">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      call(`${BASE}/${b.id}`, "PATCH", {
                        hiddenInApp: !b.hiddenInApp,
                      })
                    }
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {b.hiddenInApp ? "Так" : "Ні"}
                  </button>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {editingId === b.id ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => saveEdit(b.id)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(b.id);
                          setEditName(b.name);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        call(`${BASE}/${b.id}`, "PATCH", {
                          archived: !b.archived,
                        })
                      }
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      {b.archived ? "Відновити" : "Архівувати"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
