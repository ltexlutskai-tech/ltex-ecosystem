"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Button, Input, useToast } from "@ltex/ui";
import { useInlineRecordEdit } from "@/lib/autosave/use-inline-record-edit";
import { InlineAutosaveControls } from "../../_components/inline-autosave-controls";

export interface UnitItem {
  id: string;
  code: string | null;
  name: string;
  fullName: string | null;
  coefficient: string | null;
  archived: boolean;
}

const BASE = "/api/v1/manager/admin/units";

interface NameEditFields extends Record<string, unknown> {
  name: string;
}

export function UnitsManager({ initial }: { initial: UnitItem[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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
    });
    if (ok) {
      setName("");
      setCode("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-700">Додати одиницю</h2>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Назва (кг / шт / пара)"
        />
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Код (необов'язково)"
        />
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

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Назва</th>
              <th className="px-4 py-2 font-medium">Код</th>
              <th className="px-4 py-2 font-medium">Коефіцієнт</th>
              <th className="px-4 py-2 text-right font-medium">Дії</th>
            </tr>
          </thead>
          <tbody>
            {initial.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  Немає одиниць.
                </td>
              </tr>
            )}
            {initial.map((u) => (
              <tr
                key={u.id}
                className={`border-b last:border-b-0 ${
                  u.archived ? "bg-gray-50 text-gray-400" : ""
                }`}
              >
                {editingId === u.id ? (
                  <EditableUnitRow
                    item={u}
                    busy={busy}
                    onToggleArchived={() =>
                      call(`${BASE}/${u.id}`, "PATCH", {
                        archived: !u.archived,
                      })
                    }
                    onDone={() => {
                      setEditingId(null);
                      startTransition(() => router.refresh());
                    }}
                  />
                ) : (
                  <>
                    <td className="px-4 py-2 font-medium text-gray-800">
                      {u.name}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{u.code ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {u.coefficient ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(u.id)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            call(`${BASE}/${u.id}`, "PATCH", {
                              archived: !u.archived,
                            })
                          }
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          {u.archived ? "Відновити" : "Архівувати"}
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
 * Рядок одиниці у режимі редагування — назва автозберігається одразу (без кнопки
 * «Зберегти») через PATCH.
 */
function EditableUnitRow({
  item,
  busy,
  onToggleArchived,
  onDone,
}: {
  item: UnitItem;
  busy: boolean;
  onToggleArchived: () => void;
  onDone: () => void;
}) {
  const edit = useInlineRecordEdit<NameEditFields>({
    recordKey: `unit:${item.id}`,
    initial: { name: item.name },
    save: async (data) => {
      if (!data.name.trim()) throw new Error("Вкажіть назву");
      const res = await fetch(`${BASE}/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name.trim() }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Помилка збереження");
      }
    },
  });

  return (
    <>
      <td className="px-4 py-2 font-medium text-gray-800">
        <Input
          value={edit.fields.name}
          onChange={(e) => edit.setField("name", e.target.value)}
          className="h-8"
          autoFocus
        />
      </td>
      <td className="px-4 py-2 text-gray-600">{item.code ?? "—"}</td>
      <td className="px-4 py-2 text-gray-600">{item.coefficient ?? "—"}</td>
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
