"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";
import { buildSocialUrl, socialNetworkLabel } from "@ltex/shared";
import { Button, Input, useToast } from "@ltex/ui";
import { useRecordAutosave } from "@/lib/autosave/use-record-autosave";
import { AutosaveStatus } from "../../../_components/autosave-status";
import {
  BrandIcon,
  resolveBrandIconKind,
} from "../../../_components/brand-icons";
import { ClientWebsiteLink } from "./client-address-link";
import type { ClientDetail, ClientMessenger } from "./types";

const NETWORK_OPTIONS = [
  { value: "telegram", label: "Telegram" },
  { value: "viber", label: "Viber" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "pinterest", label: "Pinterest" },
  { value: "other", label: "Інше посилання" },
] as const;

interface MessengerFormState {
  network: string;
  handle: string;
  url: string;
  comment: string;
}

function buildBody(state: MessengerFormState) {
  return {
    network: state.network,
    handle: state.handle.trim() || null,
    url: state.url.trim() || null,
    comment: state.comment.trim() || null,
  };
}

function hasHandleOrUrl(state: MessengerFormState): boolean {
  return Boolean(state.handle.trim()) || Boolean(state.url.trim());
}

function MessengerFields({
  state,
  onChange,
}: {
  state: MessengerFormState;
  onChange: (next: MessengerFormState) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={state.network}
        onChange={(e) => onChange({ ...state, network: e.target.value })}
        className="h-8 rounded-md border border-gray-300 bg-white px-2 text-sm"
      >
        {NETWORK_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Input
        value={state.handle}
        onChange={(e) => onChange({ ...state, handle: e.target.value })}
        placeholder="@нік / ідентифікатор"
        maxLength={200}
        className="h-8 w-44"
      />
      <Input
        value={state.url}
        onChange={(e) => onChange({ ...state, url: e.target.value })}
        placeholder="https://… (опційно)"
        maxLength={500}
        className="h-8 w-56"
      />
      <Input
        value={state.comment}
        onChange={(e) => onChange({ ...state, comment: e.target.value })}
        placeholder="Коментар (опційно)"
        maxLength={200}
        className="h-8 w-40"
      />
    </div>
  );
}

function MessengerRow({
  messenger,
  clientId,
  canEdit,
  onChanged,
}: {
  messenger: ClientMessenger;
  clientId: string;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<MessengerFormState>({
    network: messenger.network,
    handle: messenger.handle ?? "",
    url: messenger.url ?? "",
    comment: messenger.comment ?? "",
  });

  const autosaveSave = useCallback(
    async (snap: MessengerFormState): Promise<void> => {
      if (!hasHandleOrUrl(snap)) return; // потрібне посилання/ідентифікатор
      const res = await fetch(
        `/api/v1/manager/clients/${clientId}/messengers/${messenger.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(buildBody(snap)),
        },
      );
      if (!res.ok) throw new Error("save_failed");
    },
    [clientId, messenger.id],
  );
  const autosave = useRecordAutosave<MessengerFormState>({
    recordKey: `client-messenger:${messenger.id}`,
    data: state,
    enabled: editing && canEdit,
    save: autosaveSave,
  });

  const url = buildSocialUrl(
    messenger.network,
    messenger.handle,
    messenger.browserUrl ?? messenger.url,
  );
  const label = socialNetworkLabel(messenger.network);
  const handle = (messenger.handle ?? "").replace(/^@/, "");

  async function save() {
    if (!hasHandleOrUrl(state)) {
      toast({
        description: "Вкажіть посилання або ідентифікатор",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v1/manager/clients/${clientId}/messengers/${messenger.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(buildBody(state)),
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
    if (!window.confirm("Видалити це посилання?")) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v1/manager/clients/${clientId}/messengers/${messenger.id}`,
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
        <MessengerFields state={state} onChange={setState} />
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            onClick={save}
            disabled={busy || !hasHandleOrUrl(state)}
          >
            Зберегти
          </Button>
          <button
            type="button"
            onClick={() => {
              autosave.reset();
              setEditing(false);
              setState({
                network: messenger.network,
                handle: messenger.handle ?? "",
                url: messenger.url ?? "",
                comment: messenger.comment ?? "",
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

  return (
    <div className="flex flex-wrap items-center gap-2 py-2">
      <BrandIcon
        kind={resolveBrandIconKind(messenger.network)}
        className="h-6 w-6"
        aria-label={label}
      />
      <span className="text-sm font-medium text-gray-800">{label}</span>
      {handle && <span className="text-sm text-gray-600">@{handle}</span>}
      {messenger.comment && (
        <span className="text-xs text-gray-500">({messenger.comment})</span>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        {url && (
          <a
            href={url}
            target={url.startsWith("viber://") ? undefined : "_blank"}
            rel="noopener"
            aria-label="Відкрити"
            title="Відкрити"
            className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
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

function AddMessengerForm({
  clientId,
  onAdded,
  onCancel,
}: {
  clientId: string;
  onAdded: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [state, setState] = useState<MessengerFormState>({
    network: "telegram",
    handle: "",
    url: "",
    comment: "",
  });
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!hasHandleOrUrl(state)) {
      toast({
        description: "Вкажіть посилання або ідентифікатор",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v1/manager/clients/${clientId}/messengers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(buildBody(state)),
        },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          description: err.error ?? "Помилка додавання",
          variant: "destructive",
        });
        return;
      }
      setState({ network: "telegram", handle: "", url: "", comment: "" });
      onAdded();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      <MessengerFields state={state} onChange={setState} />
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          onClick={submit}
          disabled={busy || !hasHandleOrUrl(state)}
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

export function ClientSocialTab({
  client,
  canEdit = false,
  isForeign = false,
}: {
  client: ClientDetail;
  canEdit?: boolean;
  isForeign?: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  const messengers = client.messengers;
  const hasWebsite = !!client.websiteUrl;
  const editable = canEdit && !isForeign;

  function refresh() {
    setAdding(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white p-5 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">
            Соцмережі та месенджери
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

        {messengers.length === 0 ? (
          <p className="text-sm text-gray-500">
            Соцмереж або месенджерів не вказано.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {messengers.map((m) => (
              <MessengerRow
                key={m.id}
                messenger={m}
                clientId={client.id}
                canEdit={editable}
                onChanged={refresh}
              />
            ))}
          </div>
        )}

        {editable && adding && (
          <AddMessengerForm
            clientId={client.id}
            onAdded={refresh}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>

      {hasWebsite && (
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">
            Сайт клієнта
          </h3>
          <ClientWebsiteLink url={client.websiteUrl} />
        </div>
      )}
    </div>
  );
}
