"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Pencil, Phone, Plus, Trash2, User, X } from "lucide-react";
import { formatPhoneUkr, phoneToTelUrl } from "@ltex/shared";
import { Button, Input, useToast } from "@ltex/ui";
import { useRecordAutosave } from "@/lib/autosave/use-record-autosave";
import { AutosaveStatus } from "../../../_components/autosave-status";
import type { ClientContact } from "./types";

interface Props {
  clientId: string;
  contacts: ClientContact[];
  /** true → masked read-only view (чужий клієнт). */
  isForeign?: boolean;
  /** true → owner/admin, можна додавати/редагувати/видаляти. */
  canEdit?: boolean;
}

interface DraftFields {
  fullName: string;
  position: string;
  phone: string;
  email: string;
  comment: string;
}

const EMPTY_DRAFT: DraftFields = {
  fullName: "",
  position: "",
  phone: "",
  email: "",
  comment: "",
};

function ContactFields({
  draft,
  setDraft,
  disabled,
}: {
  draft: DraftFields;
  setDraft: (d: DraftFields) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
      <Input
        value={draft.fullName}
        onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
        placeholder="ПІБ *"
        maxLength={255}
        disabled={disabled}
        className="h-8"
      />
      <Input
        value={draft.position}
        onChange={(e) => setDraft({ ...draft, position: e.target.value })}
        placeholder="Посада"
        maxLength={255}
        disabled={disabled}
        className="h-8"
      />
      <Input
        value={draft.phone}
        onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
        placeholder="Телефон"
        maxLength={50}
        disabled={disabled}
        className="h-8"
      />
      <Input
        value={draft.email}
        onChange={(e) => setDraft({ ...draft, email: e.target.value })}
        placeholder="Email"
        maxLength={255}
        disabled={disabled}
        className="h-8"
      />
      <Input
        value={draft.comment}
        onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
        placeholder="Коментар"
        maxLength={500}
        disabled={disabled}
        className="h-8 sm:col-span-2"
      />
    </div>
  );
}

function toPayload(draft: DraftFields) {
  return {
    fullName: draft.fullName.trim(),
    position: draft.position.trim() || null,
    phone: draft.phone.trim() || null,
    email: draft.email.trim() || null,
    comment: draft.comment.trim() || null,
  };
}

function ContactRow({
  contact,
  clientId,
  canEdit,
  onChanged,
}: {
  contact: ClientContact;
  clientId: string;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<DraftFields>({
    fullName: contact.fullName,
    position: contact.position ?? "",
    phone: contact.phone ?? "",
    email: contact.email ?? "",
    comment: contact.comment ?? "",
  });

  // Автозбереження редагування наявної особи (додавання — окрема дія нижче).
  const autosaveSave = useCallback(
    async (snap: DraftFields): Promise<void> => {
      if (!snap.fullName.trim()) return; // ПІБ обовʼязковий — чекаємо валідного
      const res = await fetch(
        `/api/v1/manager/clients/${clientId}/contacts/${contact.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(toPayload(snap)),
        },
      );
      if (!res.ok) throw new Error("save_failed");
    },
    [clientId, contact.id],
  );
  const autosave = useRecordAutosave<DraftFields>({
    recordKey: `client-contact:${contact.id}`,
    data: draft,
    enabled: editing && canEdit,
    save: autosaveSave,
  });

  async function save() {
    if (!draft.fullName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v1/manager/clients/${clientId}/contacts/${contact.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(toPayload(draft)),
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
    if (!window.confirm("Видалити цю контактну особу?")) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v1/manager/clients/${clientId}/contacts/${contact.id}`,
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
      <div className="flex flex-col gap-2 py-2.5">
        <ContactFields draft={draft} setDraft={setDraft} disabled={busy} />
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            onClick={save}
            disabled={busy || !draft.fullName.trim()}
          >
            Зберегти
          </Button>
          <button
            type="button"
            onClick={() => {
              autosave.reset();
              setEditing(false);
              setDraft({
                fullName: contact.fullName,
                position: contact.position ?? "",
                phone: contact.phone ?? "",
                email: contact.email ?? "",
                comment: contact.comment ?? "",
              });
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

  const telUrl = contact.phone ? phoneToTelUrl(contact.phone) : null;

  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
            <User className="h-3.5 w-3.5 text-gray-400" />
            {contact.fullName}
          </span>
          {contact.position && (
            <span className="text-xs text-gray-500">{contact.position}</span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-5 text-xs text-gray-600">
          {contact.phone &&
            (telUrl ? (
              <a
                href={telUrl}
                className="flex items-center gap-1 text-gray-700 hover:underline"
              >
                <Phone className="h-3 w-3" /> {formatPhoneUkr(contact.phone)}
              </a>
            ) : (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" /> {contact.phone}
              </span>
            ))}
          {contact.email && (
            <a
              href={`mailto:${contact.email}`}
              className="flex items-center gap-1 text-blue-600 hover:underline"
            >
              <Mail className="h-3 w-3" /> {contact.email}
            </a>
          )}
          {contact.comment && (
            <span className="text-gray-500">{contact.comment}</span>
          )}
        </div>
      </div>
      {canEdit && (
        <div className="flex items-center gap-1.5">
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
        </div>
      )}
    </div>
  );
}

function AddContactForm({
  clientId,
  onAdded,
  onCancel,
}: {
  clientId: string;
  onAdded: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<DraftFields>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!draft.fullName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/manager/clients/${clientId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(toPayload(draft)),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          description: err.error ?? "Помилка додавання",
          variant: "destructive",
        });
        return;
      }
      setDraft(EMPTY_DRAFT);
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <ContactFields draft={draft} setDraft={setDraft} disabled={busy} />
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={busy || !draft.fullName.trim()}
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

export function ClientContactsSection({
  clientId,
  contacts,
  isForeign = false,
  canEdit = false,
}: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  const editable = canEdit && !isForeign;
  // Для чужого клієнта контактні особи приховані (masked → порожній масив).
  if (isForeign) return null;
  if (contacts.length === 0 && !editable) return null;

  function refresh() {
    setAdding(false);
    router.refresh();
  }

  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <User className="h-4 w-4 text-gray-400" /> Контактні особи
        </h3>
        {editable && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 rounded border bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-3.5 w-3.5" /> Додати
          </button>
        )}
      </div>

      {contacts.length === 0 ? (
        <p className="text-sm text-gray-500">Контактних осіб ще не додано.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {contacts.map((c) => (
            <ContactRow
              key={c.id}
              contact={c}
              clientId={clientId}
              canEdit={editable}
              onChanged={refresh}
            />
          ))}
        </div>
      )}

      {editable && adding && (
        <AddContactForm
          clientId={clientId}
          onAdded={refresh}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  );
}
