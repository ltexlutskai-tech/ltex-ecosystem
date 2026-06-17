"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "@ltex/ui";
import { IframeHost } from "./tabs/iframe-host";
import { TabStrip } from "./tabs/tab-strip";
import { TabsProvider } from "./tabs/tabs-context";

export function WorkstationShell({
  header,
  sidebar,
  children,
}: {
  header: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
}) {
  // mount-gate: до визначення framed рендеримо нейтральний сплеш —
  // це водночас уникає hydration mismatch і гарантує, що embedded-сторінка
  // НІКОЛИ не змонтує iframe-host (глибина iframe = 1, рекурсії немає).
  const [framed, setFramed] = useState<boolean | null>(null);

  useEffect(() => {
    setFramed(window.self !== window.top);
  }, []);

  if (framed === null) {
    // Нейтральний сплеш — нейтральне тло на повну висоту.
    return <div className="h-screen bg-gray-50" />;
  }

  // Всередині iframe — лише контент поточної сторінки (без shell),
  // обгорнутий у центральні відступи (контент не торкається країв iframe).
  if (framed) {
    return <div className="min-h-screen bg-gray-50 p-3 sm:p-4">{children}</div>;
  }

  // Top-вікно — повний shell з вкладками. {children} (server-рендер
  // поточної сторінки) тут НЕ показуємо — контент дають iframe-и.
  return (
    <TabsProvider>
      <div className="flex h-screen flex-col bg-gray-50">
        {header}
        <TabStrip />
        <div className="flex flex-1 overflow-hidden">
          {sidebar}
          <main className="relative flex-1 overflow-hidden">
            <IframeHost />
          </main>
        </div>
        <Toaster />
      </div>
    </TabsProvider>
  );
}
