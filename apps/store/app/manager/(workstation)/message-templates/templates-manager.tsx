"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Textarea,
  useToast,
} from "@ltex/ui";
import {
  filterTemplates,
  type TemplateScope,
} from "@/lib/manager/message-template";
import { useInlineRecordEdit } from "@/lib/autosave/use-inline-record-edit";
import {
  AutosaveStatus,
  RestoreDraftBanner,
} from "../_components/autosave-status";
import { usePortalConfirm } from "../_components/use-portal-confirm";
import { ShareSheet } from "../prices/_components/share-sheet";

/**
 * Manager «Прайс» — Stage 5b: довідник шаблонів повідомлень (+ покращення 2026-07).
 *
 * Вкладки «Мої» / «Спільні»: автор вирішує, чи бачать шаблон інші (перемикач
 * «Спільний»). Пошук по назві АБО тексту (з автокомплітом назв через `<datalist>`).
 * Кожен шаблон має «Скопіювати» (буфер обміну) + «Поділитись» (вікно ShareSheet).
 * Редагувати/видаляти може лише автор (або admin/owner) — інші лише копіюють.
 */

export interface MessageTemplate {
  id: string;
  name: string;
  text: string;
  isShared: boolean;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function TemplatesManager({
  initial,
  currentUserId,
  isAdmin,
}: {
  initial: MessageTemplate[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [scope, setScope] = useState<TemplateScope>("mine");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [share, setShare] = useState<MessageTemplate | null>(null);

  const mineCount = useMemo(
    () =>
      filterTemplates(initial, {
        scope: "mine",
        userId: currentUserId,
        query: "",
      }).length,
    [initial, currentUserId],
  );
  const sharedCount = useMemo(
    () =>
      filterTemplates(initial, {
        scope: "shared",
        userId: currentUserId,
        query: "",
      }).length,
    [initial, currentUserId],
  );

  const visible = useMemo(
    () => filterTemplates(initial, { scope, userId: currentUserId, query }),
    [initial, scope, currentUserId, query],
  );

  // Автокомпліт назв — з поточної вкладки (без урахування пошукового запиту).
  const nameOptions = useMemo(() => {
    const names = filterTemplates(initial, {
      scope,
      userId: currentUserId,
      query: "",
    }).map((t) => t.name);
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, "uk"));
  }, [initial, scope, currentUserId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
          <ScopeTab
            active={scope === "mine"}
            onClick={() => setScope("mine")}
            label="Мої"
            count={mineCount}
          />
          <ScopeTab
            active={scope === "shared"}
            onClick={() => setScope("shared")}
            label="Спільні"
            count={sharedCount}
          />
        </div>
        <Button type="button" onClick={() => setCreating(true)}>
          + Додати шаблон
        </Button>
      </div>

      <div>
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Пошук за назвою або текстом шаблону…"
          list="template-name-options"
          aria-label="Пошук шаблонів"
        />
        <datalist id="template-name-options">
          {nameOptions.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          {query.trim()
            ? "Нічого не знайдено за цим запитом."
            : scope === "mine"
              ? "Ви ще не створили жодного шаблону. Натисніть «Додати шаблон»."
              : "Поки немає шаблонів, якими поділилися інші менеджери."}
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              canManage={isAdmin || t.createdByUserId === currentUserId}
              onEdit={() => setEditing(t)}
              onShare={() => setShare(t)}
            />
          ))}
        </ul>
      )}

      <TemplateCreateModal open={creating} onOpenChange={setCreating} />
      <TemplateEditModal
        template={editing ?? undefined}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
      <ShareSheet
        open={share !== null}
        onOpenChange={(open) => {
          if (!open) setShare(null);
        }}
        title={share ? `Поділитися: ${share.name}` : "Поділитися"}
        text={share?.text ?? ""}
      />
    </div>
  );
}

function ScopeTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-3 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-white text-gray-900 shadow-sm"
          : "text-gray-500 hover:text-gray-800"
      }`}
    >
      {label}
      <span className="ml-1.5 text-xs text-gray-400">{count}</span>
    </button>
  );
}

function TemplateRow({
  template,
  canManage,
  onEdit,
  onShare,
}: {
  template: MessageTemplate;
  canManage: boolean;
  onEdit: () => void;
  onShare: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const { confirm, dialog } = usePortalConfirm();

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(template.text);
      toast({ title: "Скопійовано", description: "Текст у буфері обміну." });
    } catch {
      toast({
        title: "Не вдалося скопіювати",
        description: "Виділіть текст і скопіюйте вручну.",
        variant: "destructive",
      });
    }
  }

  function handleDelete() {
    confirm({
      title: `Видалити шаблон «${template.name}»?`,
      destructive: true,
      confirmLabel: "Видалити",
      onConfirm: async () => {
        setLoading(true);
        try {
          const res = await fetch(
            `/api/v1/manager/message-templates/${template.id}`,
            { method: "DELETE" },
          );
          if (res.ok) {
            toast({ title: "Шаблон видалено" });
            router.refresh();
          } else {
            const data = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            toast({
              title: data.error ?? "Не вдалося видалити",
              variant: "destructive",
            });
          }
        } catch {
          toast({ title: "Помилка зʼєднання", variant: "destructive" });
        } finally {
          setLoading(false);
        }
      },
    });
  }

  return (
    <li className="rounded-md border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-800">{template.name}</span>
            {template.isShared ? (
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                Спільний
              </span>
            ) : (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                Лише я
              </span>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-600">
            {template.text}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleCopy}
              disabled={loading}
              className="h-8 px-2 text-xs"
            >
              📋 Скопіювати
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onShare}
              disabled={loading}
              className="h-8 px-2 text-xs"
            >
              Поділитись
            </Button>
          </div>
          {canManage && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onEdit}
                disabled={loading}
                className="h-8 flex-1 px-2 text-xs"
              >
                Редагувати
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={loading}
                className="h-8 px-2 text-xs"
              >
                Видалити
              </Button>
            </div>
          )}
        </div>
      </div>
      {dialog}
    </li>
  );
}

/** Створення шаблону — звичайна форма з кнопкою «Зберегти». */
function TemplateCreateModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [loading, setLoading] = useState(false);

  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLastOpen(true);
    setName("");
    setText("");
    setIsShared(false);
  }
  if (!open && lastOpen) setLastOpen(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/v1/manager/message-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, text, isShared }),
      });
      if (res.ok) {
        toast({ title: "Шаблон створено" });
        onOpenChange(false);
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast({
          title: data.error ?? "Не вдалося зберегти",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Помилка зʼєднання", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Новий шаблон</DialogTitle>
          <DialogDescription>
            Назва — для пошуку у списку. Текст — те, що вставиться у
            повідомлення.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="template-name"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Назва
            </label>
            <Input
              id="template-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              disabled={loading}
            />
          </div>
          <div>
            <label
              htmlFor="template-text"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Текст
            </label>
            <Textarea
              id="template-text"
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
              maxLength={5000}
              disabled={loading}
            />
          </div>
          <SharedCheckbox
            id="template-create-shared"
            checked={isShared}
            onChange={setIsShared}
            disabled={loading}
          />
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Збереження..." : "Зберегти"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Редагування наявного шаблону — автозбереження одразу (без кнопки «Зберегти»). */
function TemplateEditModal({
  template,
  open,
  onOpenChange,
}: {
  template?: MessageTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Редагувати шаблон</DialogTitle>
          <DialogDescription>
            Зміни зберігаються автоматично. Назва — для пошуку у списку. Текст —
            те, що вставиться у повідомлення.
          </DialogDescription>
        </DialogHeader>
        {template && (
          <TemplateEditForm
            key={template.id}
            template={template}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface TemplateEditFields extends Record<string, unknown> {
  name: string;
  text: string;
  isShared: boolean;
}

function TemplateEditForm({
  template,
  onClose,
}: {
  template: MessageTemplate;
  onClose: () => void;
}) {
  const router = useRouter();
  const edit = useInlineRecordEdit<TemplateEditFields>({
    recordKey: `message-template:${template.id}`,
    initial: {
      name: template.name,
      text: template.text,
      isShared: template.isShared,
    },
    save: async (data) => {
      if (!data.name.trim() || !data.text.trim()) {
        throw new Error("Назва й текст обовʼязкові");
      }
      const res = await fetch(
        `/api/v1/manager/message-templates/${template.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.name,
            text: data.text,
            isShared: data.isShared,
          }),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Помилка збереження");
      }
    },
  });

  return (
    <div className="space-y-4">
      {edit.hasRestore && (
        <RestoreDraftBanner
          onRestore={edit.applyRestore}
          onDismiss={edit.dismissRestore}
        />
      )}
      <div>
        <label
          htmlFor="template-edit-name"
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          Назва
        </label>
        <Input
          id="template-edit-name"
          type="text"
          value={edit.fields.name}
          onChange={(e) => edit.setField("name", e.target.value)}
          maxLength={100}
        />
      </div>
      <div>
        <label
          htmlFor="template-edit-text"
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          Текст
        </label>
        <Textarea
          id="template-edit-text"
          rows={8}
          value={edit.fields.text}
          onChange={(e) => edit.setField("text", e.target.value)}
          maxLength={5000}
        />
      </div>
      <SharedCheckbox
        id="template-edit-shared"
        checked={edit.fields.isShared}
        onChange={(v) => edit.setField("isShared", v)}
      />
      <DialogFooter className="items-center justify-between gap-2 sm:justify-between">
        <AutosaveStatus status={edit.status} savedAt={edit.savedAt} />
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            void edit.flush().finally(() => {
              router.refresh();
              onClose();
            });
          }}
        >
          Готово
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Перемикач видимості шаблону для інших менеджерів. */
function SharedCheckbox({
  id,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2 text-sm text-gray-700"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
      />
      <span>
        <span className="font-medium">Спільний</span> — бачитимуть усі менеджери
        у вкладці «Спільні». Без галочки шаблон видно лише вам.
      </span>
    </label>
  );
}
