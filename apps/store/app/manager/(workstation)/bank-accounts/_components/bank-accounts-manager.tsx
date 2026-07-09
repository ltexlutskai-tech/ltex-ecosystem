"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Button, Input, useToast } from "@ltex/ui";
import { useInlineRecordEdit } from "@/lib/autosave/use-inline-record-edit";
import { InlineAutosaveControls } from "../../_components/inline-autosave-controls";

export type BankAccountKind = "account" | "card" | "cash";

export interface BankAccountItem {
  id: string;
  name: string;
  description: string | null;
  kind: BankAccountKind;
  hiddenInApp: boolean;
  archived: boolean;
}

const BASE = "/api/v1/manager/admin/bank-accounts";

const KIND_LABELS: Record<BankAccountKind, string> = {
  account: "Рахунок",
  card: "Картка",
  cash: "Каса",
};

const KIND_OPTIONS: BankAccountKind[] = ["account", "card", "cash"];

interface BankEditFields extends Record<string, unknown> {
  name: string;
  kind: BankAccountKind;
}

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
  const [kind, setKind] = useState<BankAccountKind>("account");
  const [hiddenInApp, setHiddenInApp] = useState(false);
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
      description: description.trim() || undefined,
      kind,
      hiddenInApp,
    });
    if (ok) {
      setName("");
      setDescription("");
      setKind("account");
      setHiddenInApp(false);
    }
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
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as BankAccountKind)}
          className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-700"
          aria-label="Тип"
        >
          {KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={hiddenInApp}
            onChange={(e) => setHiddenInApp(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
          />
          Ліміт на отримання: приховати від менеджерів при приході
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
              <th className="px-4 py-2 font-medium">Тип</th>
              <th className="px-4 py-2 text-center font-medium">Прихований</th>
              <th className="px-4 py-2 text-right font-medium">Дії</th>
            </tr>
          </thead>
          <tbody>
            {initial.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
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
                {editingId === b.id ? (
                  <EditableBankRow
                    item={b}
                    busy={busy}
                    onToggleHidden={() =>
                      call(`${BASE}/${b.id}`, "PATCH", {
                        hiddenInApp: !b.hiddenInApp,
                      })
                    }
                    onToggleArchived={() =>
                      call(`${BASE}/${b.id}`, "PATCH", {
                        archived: !b.archived,
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
                      {b.name}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {b.description ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        {KIND_LABELS[b.kind]}
                      </span>
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
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(b.id)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
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
 * Рядок рахунку в режимі редагування — назва й тип автозберігаються одразу
 * (без кнопки «Зберегти») через PATCH.
 */
function EditableBankRow({
  item,
  busy,
  onToggleHidden,
  onToggleArchived,
  onDone,
}: {
  item: BankAccountItem;
  busy: boolean;
  onToggleHidden: () => void;
  onToggleArchived: () => void;
  onDone: () => void;
}) {
  const edit = useInlineRecordEdit<BankEditFields>({
    recordKey: `bank-account:${item.id}`,
    initial: { name: item.name, kind: item.kind },
    save: async (data) => {
      if (!data.name.trim()) throw new Error("Вкажіть назву");
      const res = await fetch(`${BASE}/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name.trim(), kind: data.kind }),
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
      <td className="px-4 py-2 text-gray-600">{item.description ?? "—"}</td>
      <td className="px-4 py-2">
        <select
          value={edit.fields.kind}
          onChange={(e) =>
            edit.setField("kind", e.target.value as BankAccountKind)
          }
          className="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-700"
          aria-label="Тип"
        >
          {KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2 text-center">
        <button
          type="button"
          disabled={busy}
          onClick={onToggleHidden}
          className="text-xs text-blue-600 hover:underline"
        >
          {item.hiddenInApp ? "Так" : "Ні"}
        </button>
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
