"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@ltex/ui";
import {
  NOTIFY_CHANNELS,
  type NotifyChannel,
} from "@/lib/validations/manager-me";

const LABELS: Record<NotifyChannel, { title: string; description: string }> = {
  push: {
    title: "OS push",
    description: "У браузері та (згодом) у Windows-додатку.",
  },
  telegram: {
    title: "Telegram DM",
    description: "Особисті повідомлення у Telegram.",
  },
};

export function NotifyChannelsSection({
  initialChannels,
  telegramLinked,
}: {
  initialChannels: string[];
  telegramLinked: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [channels, setChannels] = useState<NotifyChannel[]>(
    initialChannels.filter((c): c is NotifyChannel =>
      (NOTIFY_CHANNELS as readonly string[]).includes(c),
    ),
  );
  const [saving, setSaving] = useState(false);

  async function persist(next: NotifyChannel[]) {
    setSaving(true);
    try {
      const res = await fetch("/api/v1/manager/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifyChannels: next }),
      });
      if (res.ok) {
        toast({ title: "Налаштування сповіщень збережено" });
        router.refresh();
      } else {
        toast({
          title: "Не вдалося зберегти",
          variant: "destructive",
        });
        setChannels(channels);
      }
    } catch {
      toast({ title: "Помилка з'єднання", variant: "destructive" });
      setChannels(channels);
    } finally {
      setSaving(false);
    }
  }

  function toggle(channel: NotifyChannel) {
    const enabled = channels.includes(channel);
    if (!enabled && channel === "telegram" && !telegramLinked) {
      toast({
        title: "Спочатку прив'яжіть Telegram",
        description: "Канал стане доступним після успішної прив'язки.",
      });
      return;
    }
    const next = enabled
      ? channels.filter((c) => c !== channel)
      : [...channels, channel];
    setChannels(next);
    void persist(next);
  }

  return (
    <section className="rounded-lg border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-800">Канали сповіщень</h2>
      <p className="mt-1 text-sm text-gray-500">
        Оберіть, як отримувати робочі сповіщення.
      </p>
      <ul className="mt-4 space-y-3">
        {(NOTIFY_CHANNELS as readonly NotifyChannel[]).map((channel) => {
          const enabled = channels.includes(channel);
          return (
            <li
              key={channel}
              className="flex items-start justify-between gap-4 rounded-md border p-3"
            >
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {LABELS[channel].title}
                </p>
                <p className="text-xs text-gray-500">
                  {LABELS[channel].description}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={LABELS[channel].title}
                disabled={saving}
                onClick={() => toggle(channel)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50 ${
                  enabled ? "bg-green-600" : "bg-gray-200"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    enabled ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
