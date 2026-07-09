"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Button, Input, useToast } from "@ltex/ui";
import { useInlineRecordEdit } from "@/lib/autosave/use-inline-record-edit";
import { InlineAutosaveControls } from "../../_components/inline-autosave-controls";

interface RegionRef {
  id: string;
  name: string;
}

export interface CityItem {
  id: string;
  code: string | null;
  name: string;
  regionId: string | null;
  archived: boolean;
  region: RegionRef | null;
}

const BASE = "/api/v1/manager/admin/cities";

interface NameEditFields extends Record<string, unknown> {
  name: string;
}

export function CitiesManager({
  initial,
  regions,
}: {
  initial: CityItem[];
  regions: RegionRef[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [regionId, setRegionId] = useState("");
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
      regionId: regionId || undefined,
    });
    if (ok) {
      setName("");
      setRegionId("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-700">Додати місто</h2>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Назва міста"
        />
        <select
          value={regionId}
          onChange={(e) => setRegionId(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">— Область (необов'язково) —</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
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

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Назва</th>
              <th className="px-4 py-2 font-medium">Область</th>
              <th className="px-4 py-2 text-right font-medium">Дії</th>
            </tr>
          </thead>
          <tbody>
            {initial.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-400">
                  Немає міст.
                </td>
              </tr>
            )}
            {initial.map((c) => (
              <tr
                key={c.id}
                className={`border-b last:border-b-0 ${
                  c.archived ? "bg-gray-50 text-gray-400" : ""
                }`}
              >
                {editingId === c.id ? (
                  <EditableCityRow
                    item={c}
                    busy={busy}
                    onToggleArchived={() =>
                      call(`${BASE}/${c.id}`, "PATCH", {
                        archived: !c.archived,
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
                      {c.name}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {c.region?.name ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(c.id)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            call(`${BASE}/${c.id}`, "PATCH", {
                              archived: !c.archived,
                            })
                          }
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          {c.archived ? "Відновити" : "Архівувати"}
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
 * Рядок міста у режимі редагування — назва автозберігається одразу (без кнопки
 * «Зберегти») через PATCH.
 */
function EditableCityRow({
  item,
  busy,
  onToggleArchived,
  onDone,
}: {
  item: CityItem;
  busy: boolean;
  onToggleArchived: () => void;
  onDone: () => void;
}) {
  const edit = useInlineRecordEdit<NameEditFields>({
    recordKey: `city:${item.id}`,
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
      <td className="px-4 py-2 text-gray-600">{item.region?.name ?? "—"}</td>
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
