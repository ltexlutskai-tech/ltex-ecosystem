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
import { phoneToViberUrl, phoneToWhatsAppUrl } from "@ltex/shared";

/**
 * Manager — єдине вікно «Поділитися».
 *
 * Перевикористовуваний Dialog: показує редаговане textarea з готовим текстом +
 * кнопку «Скопіювати» (clipboard) + «Поділитися» (Web Share API — коли доступне).
 *
 * Кнопки Viber / Telegram / WhatsApp прибрано: їхні deep-links (`viber://forward`
 * тощо) обрізають довгі повідомлення (кирилиця у %-кодуванні швидко роздуває
 * URL) → повідомлення приходило неповним. Надійний шлях — «Скопіювати» і
 * вставити у месенджер, або системне «Поділитися».
 */

interface Props {
  /** Відкрита коли true. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Заголовок вікна. */
  title: string;
  /** Готовий текст (initial) — користувач може редагувати перед відправкою. */
  text: string;
  /**
   * Телефон конкретного клієнта. Коли заданий — зʼявляються кнопки «Viber
   * клієнта» / «WhatsApp клієнта»: копіюють текст у буфер і відкривають чат
   * саме цього клієнта (текст не передаємо в deep-link — месенджери обрізають
   * довгу кирилицю; менеджер вставляє з буфера).
   */
  clientPhone?: string | null;
  /**
   * Викликається, коли менеджер відкрив месенджер клієнта (Viber/WhatsApp) —
   * тобто фактично надіслав. Дає змогу авто-закрити повʼязане нагадування.
   */
  onOpenedClientMessenger?: () => void;
}

/**
 * Відкриває deep-link месенджера у НОВІЙ вкладці (`window.open`), а не через
 * `location.href` — інакше всередині iframe-вкладки менеджерки перехід затирав
 * би сторінку («нічого не відкривалось» / бланк). Нова вкладка передає схему
 * ОС (Viber/WhatsApp) і сама закривається.
 */
function openDeepLink(url: string): void {
  try {
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    // ignore
  }
}

/** Чи доступний Web Share API (мобільні браузери / частина десктопних). */
function hasWebShare(): boolean {
  return (
    typeof navigator !== "undefined" && typeof navigator.share === "function"
  );
}

export function ShareSheet({
  open,
  onOpenChange,
  title,
  text,
  clientPhone,
  onOpenedClientMessenger,
}: Props) {
  const { toast } = useToast();
  const [draft, setDraft] = useState(text);
  const [canShare, setCanShare] = useState(false);
  const viberUrl = phoneToViberUrl(clientPhone);
  const whatsAppUrl = phoneToWhatsAppUrl(clientPhone);

  // Скидаємо текст при кожному новому відкритті.
  useEffect(() => {
    if (open) {
      setDraft(text);
    }
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

  /** Копіює текст у буфер, відкриває чат клієнта у месенджері (нова вкладка),
   *  і сигналить батьку, що надіслано (авто-закриття нагадування). */
  async function openClientMessenger(url: string) {
    try {
      await navigator.clipboard.writeText(draft);
      toast({
        title: "Текст скопійовано",
        description:
          "Відкриваємо месенджер клієнта — вставте повідомлення у чат.",
      });
    } catch {
      // Навіть якщо копіювання не вдалось — все одно відкриваємо чат.
    }
    openDeepLink(url);
    onOpenedClientMessenger?.();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Перевірте та за потреби відредагуйте текст, потім натисніть
            «Скопіювати» і вставте у месенджер (або «Поділитися»).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            rows={10}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="font-mono text-sm"
          />

          <div className="text-xs text-gray-400">{draft.length} символів</div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleCopy}>
              📋 Скопіювати
            </Button>
            {viberUrl && (
              <Button
                type="button"
                variant="outline"
                onClick={() => openClientMessenger(viberUrl)}
              >
                Viber клієнта
              </Button>
            )}
            {whatsAppUrl && (
              <Button
                type="button"
                variant="outline"
                onClick={() => openClientMessenger(whatsAppUrl)}
              >
                WhatsApp клієнта
              </Button>
            )}
            {canShare && (
              <Button type="button" variant="outline" onClick={handleWebShare}>
                Поділитися…
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
