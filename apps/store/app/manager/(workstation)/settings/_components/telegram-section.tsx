"use client";

import { Button, useToast } from "@ltex/ui";

export function TelegramSection({
  telegramLinked,
}: {
  telegramLinked: boolean;
}) {
  const { toast } = useToast();

  function notSoon() {
    toast({
      title: "Telegram pairing буде у M1.10",
      description: "Прив'язку чату ще не реалізовано.",
    });
  }

  return (
    <section className="rounded-lg border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-800">Telegram</h2>
      <p className="mt-1 text-sm text-gray-500">
        Прив&apos;язати особистий Telegram-чат для отримання сповіщень.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {telegramLinked ? (
          <>
            <span className="inline-flex items-center gap-2 text-sm text-green-700">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Прив&apos;язано
            </span>
            <Button type="button" variant="secondary" onClick={notSoon}>
              Відв&apos;язати
            </Button>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-2 text-sm text-gray-500">
              <span className="h-2 w-2 rounded-full bg-gray-300" />
              Не прив&apos;язано
            </span>
            <Button type="button" onClick={notSoon}>
              Прив&apos;язати
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
