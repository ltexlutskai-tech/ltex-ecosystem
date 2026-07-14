"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Star } from "lucide-react";
import { Button, Input, useToast } from "@ltex/ui";

export interface RequisiteItem {
  id: string;
  name: string;
  recipient: string;
  edrpou: string | null;
  bankName: string | null;
  iban: string | null;
  purpose: string | null;
  isDefault: boolean;
  archived: boolean;
}

const BASE = "/api/v1/manager/payment-requisites";

/** Порожня форма для створення/редагування набору реквізитів. */
interface FormState {
  name: string;
  recipient: string;
  edrpou: string;
  bankName: string;
  iban: string;
  purpose: string;
  isDefault: boolean;
}

const EMPTY: FormState = {
  name: "",
  recipient: "",
  edrpou: "",
  bankName: "",
  iban: "",
  purpose: "Оплата товару",
  isDefault: false,
};

function toForm(r: RequisiteItem): FormState {
  return {
    name: r.name,
    recipient: r.recipient,
    edrpou: r.edrpou ?? "",
    bankName: r.bankName ?? "",
    iban: r.iban ?? "",
    purpose: r.purpose ?? "Оплата товару",
    isDefault: r.isDefault,
  };
}

export function RequisitesManager({ initial }: { initial: RequisiteItem[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  // editingId === null → форма створення; інакше — редагування наявного.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  // Двокрокове видалення (window.confirm блокується у вкладці-iframe).
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
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

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY);
    setShowForm(true);
  }

  function openEdit(r: RequisiteItem) {
    setEditingId(r.id);
    setForm(toForm(r));
    setShowForm(true);
  }

  async function save() {
    if (!form.name.trim() || !form.recipient.trim()) {
      toast({ title: "Вкажіть назву та одержувача", variant: "destructive" });
      return;
    }
    const payload = {
      name: form.name.trim(),
      recipient: form.recipient.trim(),
      edrpou: form.edrpou.trim() || null,
      bankName: form.bankName.trim() || null,
      iban: form.iban.trim() || null,
      purpose: form.purpose.trim() || null,
      isDefault: form.isDefault,
    };
    const ok = editingId
      ? await call(`${BASE}/${editingId}`, "PATCH", payload)
      : await call(BASE, "POST", payload);
    if (ok) {
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY);
    }
  }

  async function remove(r: RequisiteItem) {
    const ok = await call(`${BASE}/${r.id}`, "DELETE");
    if (ok) setConfirmDeleteId(null);
  }

  async function makeDefault(r: RequisiteItem) {
    await call(`${BASE}/${r.id}`, "PATCH", { isDefault: true });
  }

  return (
    <div className="space-y-4">
      {!showForm && (
        <Button
          type="button"
          onClick={openCreate}
          className="bg-green-600 text-white hover:bg-green-700"
        >
          <Plus className="mr-1 h-4 w-4" />
          Додати реквізити
        </Button>
      )}

      {showForm && (
        <div className="space-y-3 rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700">
            {editingId ? "Редагувати набір" : "Новий набір реквізитів"}
          </h2>
          <Field label="Назва (для вибору)">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="напр. ФОП Кузенко (ПриватБанк)"
            />
          </Field>
          <Field label="Одержувач">
            <Input
              value={form.recipient}
              onChange={(e) => setForm({ ...form, recipient: e.target.value })}
              placeholder="ФОП КУЗЕНКО ТАРАС СТЕПАНОВИЧ"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ЄДРПОУ / ІПН">
              <Input
                value={form.edrpou}
                onChange={(e) => setForm({ ...form, edrpou: e.target.value })}
                placeholder="3351808816"
              />
            </Field>
            <Field label="Банк">
              <Input
                value={form.bankName}
                onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                placeholder='АТ КБ "ПРИВАТБАНК"'
              />
            </Field>
          </div>
          <Field label="Рахунок / IBAN / картка">
            <Input
              value={form.iban}
              onChange={(e) => setForm({ ...form, iban: e.target.value })}
              placeholder="UA60 3052 9900 0002 6003 0108 07538"
            />
          </Field>
          <Field label="Призначення платежу">
            <Input
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              placeholder="Оплата товару"
            />
          </Field>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) =>
                setForm({ ...form, isDefault: e.target.checked })
              }
              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <span>За замовчуванням (підставляється першим)</span>
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
              disabled={busy}
            >
              Скасувати
            </Button>
            <Button
              type="button"
              onClick={() => void save()}
              disabled={busy}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              {busy ? "Збереження…" : "Зберегти"}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {initial.length === 0 ? (
          <p className="text-sm text-gray-500">Ще немає жодного набору.</p>
        ) : (
          initial.map((r) => (
            <div
              key={r.id}
              className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-white p-4 shadow-sm ${
                r.archived ? "opacity-60" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{r.name}</span>
                  {r.isDefault && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      <Star className="h-3 w-3" /> за замовчуванням
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-gray-600">{r.recipient}</div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {[r.bankName, r.iban].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              {confirmDeleteId === r.id ? (
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-gray-600">Видалити?</span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void remove(r)}
                    disabled={busy}
                    className="bg-red-600 text-white hover:bg-red-700"
                  >
                    Так
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDeleteId(null)}
                    disabled={busy}
                  >
                    Ні
                  </Button>
                </div>
              ) : (
                <div className="flex shrink-0 gap-1">
                  {!r.isDefault && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void makeDefault(r)}
                      disabled={busy}
                      title="Зробити за замовчуванням"
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(r)}
                    disabled={busy}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDeleteId(r.id)}
                    disabled={busy}
                    className="text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">
        {label}
      </label>
      {children}
    </div>
  );
}
