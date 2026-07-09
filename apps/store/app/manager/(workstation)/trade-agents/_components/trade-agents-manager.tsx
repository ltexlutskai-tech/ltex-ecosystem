"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Button, Input, useToast } from "@ltex/ui";
import { useInlineRecordEdit } from "@/lib/autosave/use-inline-record-edit";
import { InlineAutosaveControls } from "../../_components/inline-autosave-controls";

interface UserRef {
  id: string;
  fullName: string;
}

export interface TradeAgentItem {
  id: string;
  code: string | null;
  code1C: string | null;
  name: string;
  userId: string | null;
  archived: boolean;
  user: UserRef | null;
}

const BASE = "/api/v1/manager/admin/trade-agents";

interface NameEditFields extends Record<string, unknown> {
  name: string;
}

export function TradeAgentsManager({
  initial,
  users,
}: {
  initial: TradeAgentItem[];
  users: UserRef[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [onlyUnlinked, setOnlyUnlinked] = useState(false);

  const visible = onlyUnlinked
    ? initial.filter((a) => a.userId === null)
    : initial;

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
      userId: userId || undefined,
    });
    if (ok) {
      setName("");
      setUserId("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-700">Додати агента</h2>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ПІБ агента"
        />
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">— Користувач (необов'язково) —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
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

      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={onlyUnlinked}
          onChange={(e) => setOnlyUnlinked(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        Лише без користувача
      </label>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">ПІБ</th>
              <th className="px-4 py-2 font-medium">Код 1С</th>
              <th className="px-4 py-2 font-medium">Користувач</th>
              <th className="px-4 py-2 text-right font-medium">Дії</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  Немає агентів.
                </td>
              </tr>
            )}
            {visible.map((a) => (
              <tr
                key={a.id}
                className={`border-b last:border-b-0 ${
                  a.archived ? "bg-gray-50 text-gray-400" : ""
                }`}
              >
                {editingId === a.id ? (
                  <EditableAgentRow
                    item={a}
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
                    <td className="px-4 py-2 font-medium text-gray-800">
                      {a.name}
                    </td>
                    <td className="px-4 py-2">
                      {a.code1C ? (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">
                          {a.code1C}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {a.user?.fullName ?? "—"}
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
 * Рядок торгового агента у режимі редагування — ПІБ автозберігається одразу (без
 * кнопки «Зберегти») через PATCH.
 */
function EditableAgentRow({
  item,
  busy,
  onToggleArchived,
  onDone,
}: {
  item: TradeAgentItem;
  busy: boolean;
  onToggleArchived: () => void;
  onDone: () => void;
}) {
  const edit = useInlineRecordEdit<NameEditFields>({
    recordKey: `trade-agent:${item.id}`,
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
      <td className="px-4 py-2">
        {item.code1C ? (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">
            {item.code1C}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-2 text-gray-600">{item.user?.fullName ?? "—"}</td>
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
