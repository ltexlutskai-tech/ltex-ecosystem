"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Toaster } from "@ltex/ui";
import { IframeHost } from "./tabs/iframe-host";
import { TabStrip } from "./tabs/tab-strip";
import { TabUrlReporter } from "./tabs/tab-url-reporter";
import { DETACHED_WINDOW_PREFIX, TabsProvider } from "./tabs/tabs-context";

/**
 * Автономні маршрути менеджерки — рендеряться контентом (БЕЗ shell з
 * вкладками) навіть у новій вкладці браузера верхнього рівня. Сюди належать
 * сторінки друку (рахунок, накладна, касовий ордер, маршрутний лист): вони
 * відкриваються через `target="_blank"`, тож без цього top-window показував би
 * оболонку з вкладками (список замовлень), а не сам документ (7.3 фікс).
 */
function isStandaloneRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname.endsWith("/print") || pathname.includes("/print/");
}

export function WorkstationShell({
  header,
  sidebar,
  children,
}: {
  header: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  // mount-gate: до визначення framed рендеримо нейтральний сплеш —
  // це водночас уникає hydration mismatch і гарантує, що embedded-сторінка
  // НІКОЛИ не змонтує iframe-host (глибина iframe = 1, рекурсії немає).
  const [framed, setFramed] = useState<boolean | null>(null);

  useEffect(() => {
    // framed = iframe усередині shell АБО відкріплене вікно («В окреме
    // вікно», 7.3): window.name зберігається при навігації в межах вікна,
    // тож увесь його вміст рендериться без shell (контент-only, як у 1С).
    setFramed(
      window.self !== window.top ||
        window.name.startsWith(DETACHED_WINDOW_PREFIX),
    );
  }, []);

  // Автономні маршрути (друк) — завжди контент, без сплеш-гейта й без shell:
  // це те, що очікує «Рахунок»/«Друк», відкритий у новій вкладці.
  if (isStandaloneRoute(pathname)) {
    return <>{children}</>;
  }

  if (framed === null) {
    // Нейтральний сплеш — нейтральне тло на повну висоту.
    return <div className="h-screen bg-gray-50" />;
  }

  // Всередині iframe — лише контент поточної сторінки (без shell),
  // обгорнутий у центральні відступи (контент не торкається країв iframe).
  if (framed) {
    return (
      <div className="min-h-screen bg-gray-50 p-3 sm:p-4">
        <TabUrlReporter />
        {children}
        {/* Toaster у КОЖНІЙ iframe-вкладці: toast-стор — module-singleton на
            документ, тож toast, викликаний зсередини вкладки, рендериться лише
            Toaster-ом цієї ж вкладки (у верхньому вікні його не видно). Без
            цього підтвердження на кшталт «Надіслано у месенджер ✓» губились. */}
        <Toaster />
      </div>
    );
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
