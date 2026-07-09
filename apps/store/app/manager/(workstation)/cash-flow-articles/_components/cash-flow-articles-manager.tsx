"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, Pencil } from "lucide-react";
import { Button, Input, useToast } from "@ltex/ui";

export type CashFlowArticleDirection = "income" | "expense" | "both";

export interface CashFlowArticleItem {
  id: string;
  code: string | null;
  name: string;
  parentId: string | null;
  direction: CashFlowArticleDirection;
  archived: boolean;
}

const BASE = "/api/v1/manager/admin/cash-flow-articles";

const DIRECTION_LABELS: Record<CashFlowArticleDirection, string> = {
  income: "Прихід",
  expense: "Розхід",
  both: "Обидва",
};

const DIRECTION_OPTIONS: CashFlowArticleDirection[] = [
  "income",
  "expense",
  "both",
];

export function CashFlowArticlesManager({
  initial,
}: {
  initial: CashFlowArticleItem[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [direction, setDirection] = useState<CashFlowArticleDirection>("both");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDirection, setEditDirection] =
    useState<CashFlowArticleDirection>("both");

  // Тільки кореневі (без батька) — кандидати у батьки (2 рівні, як 1С).
  const parentOptions = initial.filter((a) => !a.parentId && !a.archived);
  const nameById = new Map(initial.map((a) => [a.id, a.name]));

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
      code: code.trim() || undefined,
      parentId: parentId || undefined,
      direction,
    });
    if (ok) {
      setName("");
      setCode("");
      setParentId("");
      setDirection("both");
    }
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    const ok = await call(`${BASE}/${id}`, "PATCH", {
      name: editName.trim(),
      direction: editDirection,
    });
    if (ok) setEditingId(null);
  }

  return (
    <div className="space-y-4">
      {/* Форма додавання */}
      <div className="space-y-3 rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-700">Додати статтю</h2>
        <div className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Код"
            className="w-28"
          />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Назва статті"
            className="flex-1"
          />
        </div>
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-700"
          aria-label="Батьківська стаття"
        >
          <option value="">Без батьківської статті</option>
          {parentOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={direction}
          onChange={(e) =>
            setDirection(e.target.value as CashFlowArticleDirection)
          }
          className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-700"
          aria-label="Напрям"
        >
          {DIRECTION_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {DIRECTION_LABELS[d]}
            </option>
          ))}
        </select>
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
              <th className="px-4 py-2 font-medium">Код</th>
              <th className="px-4 py-2 font-medium">Назва</th>
              <th className="px-4 py-2 font-medium">Батьківська</th>
              <th className="px-4 py-2 font-medium">Напрям</th>
              <th className="px-4 py-2 text-right font-medium">Дії</th>
            </tr>
          </thead>
          <tbody>
            {initial.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  Немає статей.
                </td>
              </tr>
            )}
            {initial.map((a) => (
              <tr
                key={a.id}
                className={`border-b last:border-b-0 ${
                  a.archived ? "bg-gray-50 text-gray-400" : ""
                }`}
              >
                <td className="px-4 py-2 font-mono text-gray-600">
                  {a.code ?? "—"}
                </td>
                <td className="px-4 py-2 font-medium text-gray-800">
                  {editingId === a.id ? (
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-8"
                    />
                  ) : (
                    a.name
                  )}
                </td>
                <td className="px-4 py-2 text-gray-600">
                  {a.parentId ? (nameById.get(a.parentId) ?? "—") : "—"}
                </td>
                <td className="px-4 py-2">
                  {editingId === a.id ? (
                    <select
                      value={editDirection}
                      onChange={(e) =>
                        setEditDirection(
                          e.target.value as CashFlowArticleDirection,
                        )
                      }
                      className="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-700"
                      aria-label="Напрям"
                    >
                      {DIRECTION_OPTIONS.map((d) => (
                        <option key={d} value={d}>
                          {DIRECTION_LABELS[d]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {DIRECTION_LABELS[a.direction]}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {editingId === a.id ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => saveEdit(a.id)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(a.id);
                          setEditName(a.name);
                          setEditDirection(a.direction);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        call(`${BASE}/${a.id}`, "PATCH", {
                          archived: !a.archived,
                        })
                      }
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      {a.archived ? "Відновити" : "Архівувати"}
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
