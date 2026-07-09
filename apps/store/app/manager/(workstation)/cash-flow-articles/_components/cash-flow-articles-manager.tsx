"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Button, Input, useToast } from "@ltex/ui";
import { useInlineRecordEdit } from "@/lib/autosave/use-inline-record-edit";
import { InlineAutosaveControls } from "../../_components/inline-autosave-controls";

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

interface ArticleEditFields extends Record<string, unknown> {
  name: string;
  direction: CashFlowArticleDirection;
}

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
                {editingId === a.id ? (
                  <EditableArticleRow
                    item={a}
                    parentName={
                      a.parentId ? (nameById.get(a.parentId) ?? "—") : "—"
                    }
                    busy={busy}
                    onToggleArchived={() =>
                      call(`${BASE}/${a.id}`, "PATCH", {
                        archived: !a.archived,
                      })
                    }
                    onDone={() => {
                      setEditingId(null);
                      startTransition(() => router.refresh());
                    }}
                  />
                ) : (
                  <>
                    <td className="px-4 py-2 font-mono text-gray-600">
                      {a.code ?? "—"}
                    </td>
                    <td className="px-4 py-2 font-medium text-gray-800">
                      {a.name}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {a.parentId ? (nameById.get(a.parentId) ?? "—") : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        {DIRECTION_LABELS[a.direction]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(a.id)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
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
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Рядок статті ДДС у режимі редагування — назва й напрям автозберігаються одразу
 * (без кнопки «Зберегти») через PATCH.
 */
function EditableArticleRow({
  item,
  parentName,
  busy,
  onToggleArchived,
  onDone,
}: {
  item: CashFlowArticleItem;
  parentName: string;
  busy: boolean;
  onToggleArchived: () => void;
  onDone: () => void;
}) {
  const edit = useInlineRecordEdit<ArticleEditFields>({
    recordKey: `cash-flow-article:${item.id}`,
    initial: { name: item.name, direction: item.direction },
    save: async (data) => {
      if (!data.name.trim()) throw new Error("Вкажіть назву");
      const res = await fetch(`${BASE}/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name.trim(),
          direction: data.direction,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Помилка збереження");
      }
    },
  });

  return (
    <>
      <td className="px-4 py-2 font-mono text-gray-600">{item.code ?? "—"}</td>
      <td className="px-4 py-2 font-medium text-gray-800">
        <Input
          value={edit.fields.name}
          onChange={(e) => edit.setField("name", e.target.value)}
          className="h-8"
          autoFocus
        />
      </td>
      <td className="px-4 py-2 text-gray-600">{parentName}</td>
      <td className="px-4 py-2">
        <select
          value={edit.fields.direction}
          onChange={(e) =>
            edit.setField(
              "direction",
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
      </td>
      <td className="px-4 py-2 text-right">
        <div className="flex flex-col items-end gap-1">
          <InlineAutosaveControls
            status={edit.status}
            savedAt={edit.savedAt}
            hasRestore={edit.hasRestore}
            onApplyRestore={edit.applyRestore}
            onDismissRestore={edit.dismissRestore}
            onDone={() => {
              void edit.flush().finally(onDone);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={onToggleArchived}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            {item.archived ? "Відновити" : "Архівувати"}
          </button>
        </div>
      </td>
    </>
  );
}
