"use client";

import { useState } from "react";
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
import { useInlineRecordEdit } from "@/lib/autosave/use-inline-record-edit";
import {
  AutosaveStatus,
  RestoreDraftBanner,
} from "../_components/autosave-status";
import { usePortalConfirm } from "../_components/use-portal-confirm";

/**
 * Manager «Прайс» — Stage 5b: довідник шаблонів повідомлень.
 *
 * Список шаблонів + кнопка «Додати» (модалка name+text) + per-row Редагувати /
 * Видалити. Редагування наявного шаблону — **автозбереження одразу** (без кнопки
 * «Зберегти»); створення лишається кнопкою «Додати». Дані з API
 * `/api/v1/manager/message-templates`, `router.refresh()` після мутацій.
 */

export interface MessageTemplate {
  id: string;
  name: string;
  text: string;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function TemplatesManager({ initial }: { initial: MessageTemplate[] }) {
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setCreating(true)}>
          + Додати шаблон
        </Button>
      </div>

      {initial.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          Поки немає жодного шаблону. Натисніть «Додати шаблон», щоб створити
          першу готову фразу.
        </div>
      ) : (
        <ul className="space-y-2">
          {initial.map((t) => (
            <TemplateRow key={t.id} template={t} onEdit={() => setEditing(t)} />
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
    </div>
  );
}

function TemplateRow({
  template,
  onEdit,
}: {
  template: MessageTemplate;
  onEdit: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const { confirm, dialog } = usePortalConfirm();

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
          <div className="font-medium text-gray-800">{template.name}</div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-600">
            {template.text}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onEdit}
            disabled={loading}
            className="h-8 px-2 text-xs"
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
  const [loading, setLoading] = useState(false);

  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLastOpen(true);
    setName("");
    setText("");
  }
  if (!open && lastOpen) setLastOpen(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/v1/manager/message-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, text }),
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
    initial: { name: template.name, text: template.text },
    save: async (data) => {
      if (!data.name.trim() || !data.text.trim()) {
        throw new Error("Назва й текст обовʼязкові");
      }
      const res = await fetch(
        `/api/v1/manager/message-templates/${template.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: data.name, text: data.text }),
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
