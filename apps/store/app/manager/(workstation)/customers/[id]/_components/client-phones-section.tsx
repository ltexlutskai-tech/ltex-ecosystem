"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Pencil, Phone, Plus, Trash2, X } from "lucide-react";
import {
  formatPhoneUkr,
  phoneToTelUrl,
  phoneToViberUrl,
  phoneToWhatsAppUrl,
} from "@ltex/shared";
import { Button, Input, useToast } from "@ltex/ui";
import { useRecordAutosave } from "@/lib/autosave/use-record-autosave";
import { AutosaveStatus } from "../../../_components/autosave-status";
import { BrandIcon } from "../../../_components/brand-icons";
import type { ClientPhone } from "./types";

const MESSENGER_OPTIONS = [
  { value: "", label: "Без месенджера" },
  { value: "viber", label: "Viber" },
  { value: "telegram", label: "Telegram" },
  { value: "whatsapp", label: "WhatsApp" },
] as const;

interface Props {
  clientId: string;
  phones: ClientPhone[];
  /** Основний номер з `phonePrimary` (read-only, керується скаляром). */
  phonePrimary: string | null;
  /** true → masked read-only view (чужий клієнт). */
  isForeign?: boolean;
  /** true → owner/admin, можна додавати/редагувати/видаляти. */
  canEdit?: boolean;
}

/** Кнопки месенджерів + дзвінок для одного номера (brand-glyph icons). */
function PhoneActions({ phone }: { phone: string }) {
  const telUrl = phoneToTelUrl(phone);
  const viberUrl = phoneToViberUrl(phone);
  const whatsAppUrl = phoneToWhatsAppUrl(phone);
  return (
    <div className="flex items-center gap-1.5">
      {telUrl && (
        <a
          href={telUrl}
          aria-label="Подзвонити"
          title="Подзвонити"
          className="flex h-7 w-7 items-center justify-center rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
        >
          <Phone className="h-3.5 w-3.5" />
        </a>
      )}
      {viberUrl && (
        <a
          href={viberUrl}
          aria-label="Viber"
          title="Viber"
          className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-50 hover:bg-purple-100"
        >
          <BrandIcon kind="viber" className="h-4 w-4" />
        </a>
      )}
      {whatsAppUrl && (
        <a
          href={whatsAppUrl}
          target="_blank"
          rel="noopener"
          aria-label="WhatsApp"
          title="WhatsApp"
          className="flex h-7 w-7 items-center justify-center rounded-md bg-green-50 hover:bg-green-100"
        >
          <BrandIcon kind="whatsapp" className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

function PhoneRow({
  phone,
  clientId,
  canEdit,
  onChanged,
}: {
  phone: ClientPhone;
  clientId: string;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [value, setValue] = useState(phone.phone);
  const [messenger, setMessenger] = useState(phone.messenger ?? "");

  const autosaveSave = useCallback(
    async (snap: { value: string; messenger: string }): Promise<void> => {
      const trimmed = snap.value.trim();
      if (!trimmed) return; // порожній номер не зберігаємо
      const res = await fetch(
        `/api/v1/manager/clients/${clientId}/phones/${phone.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            phone: trimmed,
            messenger: snap.messenger || null,
          }),
        },
      );
      if (!res.ok) throw new Error("save_failed");
    },
    [clientId, phone.id],
  );
  const autosave = useRecordAutosave<{ value: string; messenger: string }>({
    recordKey: `client-phone:${phone.id}`,
    data: { value, messenger },
    enabled: editing && canEdit,
    save: autosaveSave,
  });

  async function save() {
    const trimmed = value.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v1/manager/clients/${clientId}/phones/${phone.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            phone: trimmed,
            messenger: messenger || null,
          }),
        },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          description: err.error ?? "Помилка збереження",
          variant: "destructive",
        });
        return;
      }
      autosave.reset();
      setEditing(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Видалити цей номер?")) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v1/manager/clients/${clientId}/phones/${phone.id}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          description: err.error ?? "Помилка видалення",
          variant: "destructive",
        });
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 py-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="+380 50 123 45 67"
          maxLength={32}
          className="h-8 w-48"
        />
        <select
          value={messenger}
          onChange={(e) => setMessenger(e.target.value)}
          className="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm"
        >
          {MESSENGER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            onClick={save}
            disabled={busy || !value.trim()}
          >
            Зберегти
          </Button>
          <button
            type="button"
            onClick={() => {
              autosave.reset();
              setEditing(false);
              setValue(phone.phone);
              setMessenger(phone.messenger ?? "");
            }}
            disabled={busy}
            aria-label="Скасувати"
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
          <AutosaveStatus status={autosave.status} savedAt={autosave.savedAt} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <span className="font-mono text-sm text-gray-800">
        {formatPhoneUkr(phone.phone)}
      </span>
      {phone.messenger && (
        <BrandIcon
          kind={phone.messenger}
          className="h-4 w-4"
          aria-label={phone.messenger}
        />
      )}
      {phone.label && (
        <span className="text-xs text-gray-500">({phone.label})</span>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        <PhoneActions phone={phone.phone} />
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={busy}
              aria-label="Редагувати"
              title="Редагувати"
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              aria-label="Видалити"
              title="Видалити"
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function AddPhoneForm({
  clientId,
  onAdded,
  onCancel,
}: {
  clientId: string;
  onAdded: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [value, setValue] = useState("");
  const [messenger, setMessenger] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/manager/clients/${clientId}/phones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: trimmed, messenger: messenger || null }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          description: err.error ?? "Помилка додавання",
          variant: "destructive",
        });
        return;
      }
      setValue("");
      setMessenger("");
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="+380 50 123 45 67"
        maxLength={32}
        className="h-8 w-48"
      />
      <select
        value={messenger}
        onChange={(e) => setMessenger(e.target.value)}
        className="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm"
      >
        {MESSENGER_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={busy || !value.trim()}
        >
          Додати
        </Button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          aria-label="Скасувати"
          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function ClientPhonesSection({
  clientId,
  phones,
  phonePrimary,
  isForeign,
  canEdit,
}: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  if (phones.length === 0 && !phonePrimary && !canEdit) return null;

  function refresh() {
    setAdding(false);
    router.refresh();
  }

  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          Номери телефонів
        </h3>
        {!isForeign && canEdit && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 rounded border bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-3.5 w-3.5" /> Додати
          </button>
        )}
      </div>

      <div className="divide-y divide-gray-100">
        {phonePrimary && (
          <div className="flex flex-wrap items-center gap-2 py-2">
            {isForeign ? (
              <span className="font-mono text-sm text-gray-500">
                {phonePrimary}
              </span>
            ) : (
              <span className="font-mono text-sm text-gray-800">
                {formatPhoneUkr(phonePrimary)}
              </span>
            )}
            <span className="text-xs text-gray-500">(основний)</span>
            {isForeign ? (
              <Lock
                className="ml-auto h-3.5 w-3.5 text-gray-400"
                aria-label="Контакт приховано"
              />
            ) : (
              <div className="ml-auto">
                <PhoneActions phone={phonePrimary} />
              </div>
            )}
          </div>
        )}

        {phones.map((p) =>
          isForeign ? (
            <div key={p.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="font-mono text-sm text-gray-500">{p.phone}</span>
              {p.label && (
                <span className="text-xs text-gray-500">({p.label})</span>
              )}
              <Lock
                className="ml-auto h-3.5 w-3.5 text-gray-400"
                aria-label="Контакт приховано"
              />
            </div>
          ) : (
            <PhoneRow
              key={p.id}
              phone={p}
              clientId={clientId}
              canEdit={Boolean(canEdit)}
              onChanged={refresh}
            />
          ),
        )}
      </div>

      {!isForeign && canEdit && adding && (
        <AddPhoneForm
          clientId={clientId}
          onAdded={refresh}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  );
}
