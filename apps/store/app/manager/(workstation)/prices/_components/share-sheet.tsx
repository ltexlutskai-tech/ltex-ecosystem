"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Textarea,
  useToast,
} from "@ltex/ui";
import {
  telegramShareUrl,
  viberShareUrl,
  whatsappShareUrl,
} from "@/lib/manager/messenger-links";

/**
 * Manager «Прайс» — Stage 5a єдине вікно «Поділитися».
 *
 * Перевикористовуваний Dialog: показує редаговане textarea з готовим текстом +
 * кнопку «Скопіювати» (clipboard) + «Поділитися» (Web Share API — тільки коли
 * доступне) + кнопки месенджерів Viber / Telegram / WhatsApp (відкривають
 * месенджер з підставленим текстом). Працює і на телефоні, і на компʼютері.
 *
 * Web Share / clipboard — клієнтське (browser API). Месенджер-лінки будуються
 * чистими функціями `lib/manager/messenger-links.ts`.
 */

interface Props {
  /** Відкрита коли true. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Заголовок вікна. */
  title: string;
  /** Готовий текст (initial) — користувач може редагувати перед відправкою. */
  text: string;
}

/** Чи доступний Web Share API (мобільні браузери / частина десктопних). */
function hasWebShare(): boolean {
  return (
    typeof navigator !== "undefined" && typeof navigator.share === "function"
  );
}

export function ShareSheet({ open, onOpenChange, title, text }: Props) {
  const { toast } = useToast();
  const [draft, setDraft] = useState(text);
  const [canShare, setCanShare] = useState(false);

  // Скидаємо текст при кожному новому відкритті.
  useEffect(() => {
    if (open) setDraft(text);
  }, [open, text]);

  // navigator.share доступне лише у браузері — перевіряємо після монтування.
  useEffect(() => {
    setCanShare(hasWebShare());
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(draft);
      toast({ title: "Скопійовано", description: "Текст у буфері обміну." });
    } catch {
      toast({
        title: "Не вдалося скопіювати",
        description: "Виділіть текст і скопіюйте вручну.",
        variant: "destructive",
      });
    }
  }

  async function handleWebShare() {
    try {
      await navigator.share({ text: draft });
    } catch {
      // Користувач скасував share або API недоступне — мовчки ігноруємо.
    }
  }

  function openMessenger(url: string) {
    // _blank — відкриває web-версію / deep-link, не залишаючи менеджерську панель.
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Перевірте та за потреби відредагуйте текст, потім скопіюйте або
            оберіть месенджер.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            rows={10}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="font-mono text-sm"
          />

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={handleCopy}>
              📋 Скопіювати
            </Button>
            {canShare && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleWebShare}
              >
                Поділитися…
              </Button>
            )}
          </div>

          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-gray-400">
              Месенджери
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openMessenger(viberShareUrl(draft))}
              >
                Viber
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openMessenger(telegramShareUrl(draft))}
              >
                Telegram
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openMessenger(whatsappShareUrl(draft))}
              >
                WhatsApp
              </Button>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Viber на компʼютері відкриється лише з установленим Viber Desktop
              — інакше скористайтесь кнопкою «Скопіювати».
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
