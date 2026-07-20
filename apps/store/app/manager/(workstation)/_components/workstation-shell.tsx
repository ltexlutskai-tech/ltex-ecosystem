"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Toaster } from "@ltex/ui";
import type { UiMode } from "@/lib/manager/ui-mode";
import { IframeHost } from "./tabs/iframe-host";
import { TabStrip } from "./tabs/tab-strip";
import { TabUrlReporter } from "./tabs/tab-url-reporter";
import { DETACHED_WINDOW_PREFIX, TabsProvider } from "./tabs/tabs-context";

/**
 * Автономні маршрути менеджерки — рендеряться контентом (БЕЗ shell з
 * вкладками) навіть у новій вкладці браузера верхнього рівня. Сюди належать
 * сторінки друку (рахунок, накладна, касовий ордер, маршрутний лист): вони
 * відкриваються через `target="_blank"`, тож без цього top-window показував би
 * оболонку (список замовлень), а не сам документ (7.3 фікс).
 */
function isStandaloneRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname.endsWith("/print") || pathname.includes("/print/");
}

/**
 * Оболонка робочого простору. `mode` приходить з root-layout (cookie):
 * - "classic" — 1С-подібні вкладки+iframe (`ClassicShell`);
 * - "simple"  — одне вікно зі звичайною навігацією (`SimpleShell`).
 */
export function WorkstationShell({
  header,
  sidebar,
  children,
  mode,
}: {
  header: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
  mode: UiMode;
}) {
  const pathname = usePathname();

  // Друк — завжди чистий контент, у будь-якому режимі.
  if (isStandaloneRoute(pathname)) {
    return <>{children}</>;
  }

  if (mode === "simple") {
    return (
      <SimpleShell header={header} sidebar={sidebar}>
        {children}
      </SimpleShell>
    );
  }

  return (
    <ClassicShell header={header} sidebar={sidebar}>
      {children}
    </ClassicShell>
  );
}

/**
 * Простий режим: без вкладок і iframe. Зафіксовані шапка + ліва панель, одна
 * прокручувана робоча область. Сайдбар (`SidebarNavLink`) поза `TabsProvider`
 * автоматично працює як звичайні лінки (клієнтська навігація Next.js).
 */
function SimpleShell({
  header,
  sidebar,
  children,
}: {
  header: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {header}
      <div className="flex flex-1 overflow-hidden">
        {sidebar}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}

/**
 * Класичний режим (1С-подібний): рядок вкладок + iframe-и. Кожна вкладка —
 * постійно змонтований iframe зі справжньою сторінкою `/manager/...`.
 */
function ClassicShell({
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
    // framed = iframe усередині shell АБО відкріплене вікно («В окреме
    // вікно», 7.3): window.name зберігається при навігації в межах вікна,
    // тож увесь його вміст рендериться без shell (контент-only, як у 1С).
    setFramed(
      window.self !== window.top ||
        window.name.startsWith(DETACHED_WINDOW_PREFIX),
    );
  }, []);

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
