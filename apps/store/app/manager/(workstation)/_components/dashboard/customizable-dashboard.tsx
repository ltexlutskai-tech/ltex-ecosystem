"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  ClipboardCheck,
  GripVertical,
  Minus,
  Plus,
  RotateCcw,
  Settings2,
  X,
} from "lucide-react";
import { useToast } from "@ltex/ui";
import {
  DASHBOARD_WIDGETS,
  financeAvailableFor,
  getWidgetDef,
  type DashboardWidget,
  type DashboardWidgetType,
} from "@/lib/manager/dashboard-widgets";
import type { ManagerRole } from "@/lib/auth/jwt";
import type { FinanceStats } from "@/lib/finance/owner-stats";
import { OpenTabLink } from "../open-tab-link";
import { DashboardTiles, type DashboardTileCounts } from "../dashboard-tiles";
import { DashboardCurrencyEditModal } from "../dashboard-currency-edit-modal";
import { RevenueChart } from "./revenue-chart";

export interface DashboardData {
  fullName: string;
  role: ManagerRole;
  clientCount: number;
  totalDebt: number;
  eur: number | null;
  usd: number | null;
  tileCounts: DashboardTileCounts;
  canEditCurrency: boolean;
  openReminderCount: number;
  finance: FinanceStats | null;
}

const PERIOD_LABELS: Record<string, string> = {
  today: "Сьогодні",
  week: "Тиждень",
  month: "Місяць",
  year: "Рік",
  all: "Весь час",
};

function eurFmt(n: number): string {
  return n.toLocaleString("uk-UA", { maximumFractionDigits: 0 });
}

// Ширина віджета через ЛІТЕРАЛЬНІ Tailwind-класи (щоб покривались purge). На
// мобільному — 1 колонка (кожен віджет на всю ширину), на lg — span у 4-колонках.
// Inline `grid-column: span N` НЕ використовуємо: у 1-колонковій сітці він плодить
// неявні колонки → горизонтальний overflow.
const SPAN_LG: Record<number, string> = {
  1: "lg:col-span-1",
  2: "lg:col-span-2",
  3: "lg:col-span-3",
  4: "lg:col-span-4",
};

export function CustomizableDashboard({
  data,
  initialWidgets,
  currentPeriod,
}: {
  data: DashboardData;
  initialWidgets: DashboardWidget[];
  currentPeriod: string;
}) {
  const { toast } = useToast();
  const [widgets, setWidgets] = useState<DashboardWidget[]>(initialWidgets);
  const [editMode, setEditMode] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const financeOk = financeAvailableFor(data.role) && data.finance !== null;

  // ── Збереження розкладу на сервер ──
  const persist = useCallback(
    async (next: DashboardWidget[]) => {
      try {
        const res = await fetch("/api/v1/manager/me/dashboard", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ widgets: next }),
        });
        if (!res.ok) throw new Error("save_failed");
      } catch {
        toast({
          description: "Не вдалося зберегти розклад",
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  const commit = useCallback(
    (next: DashboardWidget[]) => {
      setWidgets(next);
      void persist(next);
    },
    [persist],
  );

  function addWidget(type: DashboardWidgetType) {
    const def = getWidgetDef(type);
    if (!def) return;
    const id = `${type}-${Date.now().toString(36)}-${widgets.length}`;
    commit([...widgets, { id, type, w: def.defaultW }]);
    setPaletteOpen(false);
  }

  function removeWidget(id: string) {
    commit(widgets.filter((w) => w.id !== id));
  }

  function resizeWidget(id: string, delta: number) {
    commit(
      widgets.map((w) => {
        if (w.id !== id) return w;
        const def = getWidgetDef(w.type);
        if (!def) return w;
        const next = Math.min(def.maxW, Math.max(def.minW, w.w + delta));
        return { ...w, w: next };
      }),
    );
  }

  function moveWidget(from: number, to: number) {
    if (from === to || to < 0 || to >= widgets.length) return;
    const next = [...widgets];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    commit(next);
  }

  function setNoteText(id: string, text: string) {
    const next = widgets.map((w) => (w.id === id ? { ...w, text } : w));
    setWidgets(next);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => void persist(next), 800);
  }

  async function resetLayout() {
    try {
      const res = await fetch("/api/v1/manager/me/dashboard", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      const cfg = (await res.json()) as { widgets: DashboardWidget[] };
      setWidgets(cfg.widgets);
      toast({ description: "Розклад скинуто до типового" });
    } catch {
      toast({ description: "Не вдалося скинути", variant: "destructive" });
    }
  }

  const availablePalette = useMemo(
    () => DASHBOARD_WIDGETS.filter((d) => !d.finance || financeOk),
    [financeOk],
  );

  return (
    <div className="space-y-4">
      {/* Тулбар кастомізації */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {financeOk && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm text-gray-500">Період:</span>
              {Object.keys(PERIOD_LABELS).map((p) => (
                <Link
                  key={p}
                  href={`?period=${p}`}
                  className={`rounded-md border px-2.5 py-1 text-sm ${
                    p === currentPeriod
                      ? "border-emerald-500 bg-emerald-50 font-medium text-emerald-800"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-400"
                  }`}
                >
                  {PERIOD_LABELS[p]}
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editMode && (
            <>
              <button
                type="button"
                onClick={() => setPaletteOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Plus className="h-4 w-4" /> Додати віджет
              </button>
              <button
                type="button"
                onClick={resetLayout}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <RotateCcw className="h-4 w-4" /> Скинути
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setEditMode((v) => !v);
              setPaletteOpen(false);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
              editMode
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Settings2 className="h-4 w-4" />
            {editMode ? "Готово" : "Налаштувати"}
          </button>
        </div>
      </div>

      {/* Палітра доступних віджетів */}
      {editMode && paletteOpen && (
        <div className="rounded-lg border bg-white p-3 shadow-sm">
          <p className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Додати віджет на робочий стіл
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {availablePalette.map((d) => (
              <button
                key={d.type}
                type="button"
                onClick={() => addWidget(d.type)}
                className="flex flex-col rounded-md border border-gray-200 bg-white px-3 py-2 text-left hover:border-emerald-400 hover:bg-emerald-50"
              >
                <span className="text-sm font-medium text-gray-800">
                  {d.title}
                </span>
                <span className="text-xs text-gray-500">{d.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {editMode && (
        <p className="text-xs text-gray-500">
          Перетягуйте віджети (за ⠿), змінюйте ширину кнопками − / +, прибирайте
          хрестиком. Зміни зберігаються автоматично.
        </p>
      )}

      {/* Сітка віджетів */}
      {widgets.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-10 text-center text-sm text-gray-500">
          Робочий стіл порожній. Натисніть «Налаштувати» → «Додати віджет».
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          {widgets.map((widget, index) => {
            const def = getWidgetDef(widget.type);
            if (!def) return null;
            return (
              <div
                key={widget.id}
                className={`col-span-1 min-w-0 ${SPAN_LG[widget.w] ?? "lg:col-span-1"}`}
                draggable={editMode}
                onDragStart={() => {
                  dragIndex.current = index;
                }}
                onDragOver={(e) => {
                  if (editMode) e.preventDefault();
                }}
                onDrop={(e) => {
                  if (!editMode) return;
                  e.preventDefault();
                  if (dragIndex.current !== null)
                    moveWidget(dragIndex.current, index);
                  dragIndex.current = null;
                }}
              >
                {editMode && (
                  <div className="mb-1 flex items-center justify-between rounded-t-md border border-b-0 border-emerald-200 bg-emerald-50 px-2 py-1">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-800">
                      <GripVertical className="h-3.5 w-3.5 cursor-grab text-emerald-500" />
                      {def.title}
                    </span>
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => resizeWidget(widget.id, -1)}
                        disabled={widget.w <= def.minW}
                        aria-label="Вужче"
                        className="flex h-6 w-6 items-center justify-center rounded text-emerald-700 hover:bg-emerald-100 disabled:opacity-30"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center text-xs text-emerald-700">
                        {widget.w}/4
                      </span>
                      <button
                        type="button"
                        onClick={() => resizeWidget(widget.id, 1)}
                        disabled={widget.w >= def.maxW}
                        aria-label="Ширше"
                        className="flex h-6 w-6 items-center justify-center rounded text-emerald-700 hover:bg-emerald-100 disabled:opacity-30"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeWidget(widget.id)}
                        aria-label="Прибрати"
                        className="ml-1 flex h-6 w-6 items-center justify-center rounded text-red-500 hover:bg-red-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                )}
                <div className={editMode ? "opacity-95" : ""}>
                  <WidgetContent
                    widget={widget}
                    data={data}
                    noteEditable={!editMode}
                    onNoteEdit={(text) => setNoteText(widget.id, text)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Віджети ───────────────────────────

function Card({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="h-full rounded-lg border bg-white p-4 shadow-sm">
      {title && (
        <p className="mb-1 text-xs font-semibold tracking-wide text-gray-400 uppercase">
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  href,
  accent = "gray",
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
  accent?: "gray" | "emerald" | "indigo" | "amber" | "sky" | "red";
}) {
  const accentCls: Record<string, string> = {
    gray: "text-gray-900",
    emerald: "text-emerald-700",
    indigo: "text-indigo-700",
    amber: "text-amber-700",
    sky: "text-sky-700",
    red: "text-red-700",
  };
  const body = (
    <div className="h-full rounded-lg border bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="text-xs font-semibold tracking-wide text-gray-400 uppercase">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${accentCls[accent]}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-gray-500">{sub}</div>}
    </div>
  );
  if (href) {
    return (
      <OpenTabLink href={href} label={label} className="block h-full">
        {body}
      </OpenTabLink>
    );
  }
  return body;
}

function WidgetContent({
  widget,
  data,
  noteEditable,
  onNoteEdit,
}: {
  widget: DashboardWidget;
  data: DashboardData;
  noteEditable: boolean;
  onNoteEdit: (text: string) => void;
}) {
  const fin = data.finance;

  switch (widget.type) {
    case "greeting":
      return (
        <Card>
          <h1 className="text-2xl font-bold text-gray-800">
            Вітаємо, {data.fullName}!
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Робочий стіл L-TEX Manager.
          </p>
        </Card>
      );
    case "my-clients":
      return (
        <StatCard
          label="Мої клієнти"
          value={String(data.clientCount)}
          sub="закріплено за мною"
          href="/manager/customers?onlyMine=true"
        />
      );
    case "total-debt":
      return (
        <StatCard
          label="Загальний борг"
          value={`${eurFmt(data.totalDebt)} €`}
          sub="моїх клієнтів"
          accent={data.totalDebt > 0 ? "red" : "gray"}
        />
      );
    case "currency":
      return <CurrencyWidget data={data} />;
    case "tiles":
      return <DashboardTiles counts={data.tileCounts} />;
    case "quick-links":
      return <QuickLinksWidget />;
    case "reminders":
      return (
        <StatCard
          label="Нагадування"
          value={String(data.openReminderCount)}
          sub="відкритих"
          accent={data.openReminderCount > 0 ? "amber" : "gray"}
          href="/manager/reminders"
        />
      );
    case "tasks":
      return (
        <CountFetchWidget
          label="Завдання"
          sub="на мене"
          endpoint="/api/v1/manager/tasks/count"
          field="total"
          href="/manager/tasks"
        />
      );
    case "pending-docs":
      return <PendingDocsWidget />;
    case "note":
      return (
        <NoteWidget
          text={widget.text ?? ""}
          editable={noteEditable}
          onChange={onNoteEdit}
        />
      );
    case "fin-revenue":
      return fin ? (
        <StatCard
          label="Виручка"
          value={`${eurFmt(fin.revenueEur)} €`}
          sub={`${fin.salesCount} реалізацій`}
          accent="emerald"
        />
      ) : (
        <UnavailableWidget />
      );
    case "fin-margin":
      return fin ? (
        <StatCard
          label="Маржа"
          value={`${eurFmt(fin.marginEurKnown)} €`}
          sub={
            fin.lotsWithoutCost > 0
              ? `⚠ ${fin.lotsWithoutCost} рядків без закупки`
              : "повний розрахунок"
          }
          accent="indigo"
        />
      ) : (
        <UnavailableWidget />
      );
    case "fin-debts":
      return fin ? (
        <StatCard
          label="Борги клієнтів"
          value={`${eurFmt(fin.totalDebtEur)} €`}
          sub="сумарно по базі"
          accent="amber"
        />
      ) : (
        <UnavailableWidget />
      );
    case "fin-active":
      return fin ? (
        <StatCard
          label="Активні клієнти"
          value={String(fin.activeClientsCount)}
          sub="у базі"
          accent="sky"
        />
      ) : (
        <UnavailableWidget />
      );
    case "fin-chart":
      return fin ? (
        <Card title="Виручка за 12 місяців">
          <RevenueChart data={fin.monthlyRevenue} />
        </Card>
      ) : (
        <UnavailableWidget />
      );
    case "fin-top-clients":
      return fin ? <TopClientsWidget stats={fin} /> : <UnavailableWidget />;
    default:
      return null;
  }
}

function UnavailableWidget() {
  return (
    <Card>
      <p className="text-sm text-gray-500">Дані недоступні для вашої ролі.</p>
    </Card>
  );
}

function CurrencyWidget({ data }: { data: DashboardData }) {
  const [open, setOpen] = useState(false);
  const fmt = (v: number | null) =>
    v == null || !Number.isFinite(v)
      ? "—"
      : v.toLocaleString("uk-UA", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  return (
    <Card title="Курси валют">
      {data.eur == null && data.usd == null ? (
        <p className="text-sm text-gray-500">Курси не завантажені з 1С.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-gray-700">
          <span>
            EUR <span className="font-semibold">{fmt(data.eur)}</span> грн
          </span>
          <span>
            USD <span className="font-semibold">{fmt(data.usd)}</span> грн
          </span>
        </div>
      )}
      {data.canEditCurrency && (
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-2 text-sm text-emerald-700 hover:underline"
          >
            Змінити курси
          </button>
          <DashboardCurrencyEditModal
            open={open}
            onOpenChange={setOpen}
            eur={data.eur}
            usd={data.usd}
          />
        </>
      )}
    </Card>
  );
}

const QUICK_LINKS: { href: string; label: string }[] = [
  { href: "/manager/customers", label: "Клієнти" },
  { href: "/manager/orders", label: "Замовлення" },
  { href: "/manager/sales", label: "Реалізація" },
  { href: "/manager/prices", label: "Прайс" },
  { href: "/manager/reminders", label: "Нагадування" },
  { href: "/manager/tasks", label: "Завдання" },
];

function QuickLinksWidget() {
  return (
    <Card title="Швидкі посилання">
      <div className="flex flex-wrap gap-2">
        {QUICK_LINKS.map((l) => (
          <OpenTabLink
            key={l.href}
            href={l.href}
            label={l.label}
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-emerald-400 hover:bg-emerald-50"
          >
            {l.label}
          </OpenTabLink>
        ))}
      </div>
    </Card>
  );
}

function useLiveCount(endpoint: string, field: string) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch(endpoint, { cache: "no-store" });
        if (!r.ok) return;
        const json = (await r.json()) as Record<string, unknown>;
        const v = json[field];
        if (alive && typeof v === "number") setCount(v);
      } catch {
        // silent — лічильник не критичний
      }
    })();
    return () => {
      alive = false;
    };
  }, [endpoint, field]);
  return count;
}

function CountFetchWidget({
  label,
  sub,
  endpoint,
  field,
  href,
}: {
  label: string;
  sub: string;
  endpoint: string;
  field: string;
  href: string;
}) {
  const count = useLiveCount(endpoint, field);
  return (
    <StatCard
      label={label}
      value={count === null ? "…" : String(count)}
      sub={sub}
      accent={count && count > 0 ? "amber" : "gray"}
      href={href}
    />
  );
}

function PendingDocsWidget() {
  const orders = useLiveCount("/api/v1/manager/pending-counts", "orders");
  const sales = useLiveCount("/api/v1/manager/pending-counts", "sales");
  return (
    <Card title="Сайтові документи (очікують)">
      <div className="grid grid-cols-2 gap-2">
        <OpenTabLink
          href="/manager/orders?source=site"
          label="Замовлення з сайту"
          className="rounded-md border border-gray-200 p-3 hover:border-emerald-400 hover:bg-emerald-50"
        >
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-emerald-600" />
            <div>
              <div className="text-lg font-bold text-gray-900">
                {orders === null ? "…" : orders}
              </div>
              <div className="text-xs text-gray-500">Замовлення</div>
            </div>
          </div>
        </OpenTabLink>
        <OpenTabLink
          href="/manager/sales?source=site"
          label="Реалізації з сайту"
          className="rounded-md border border-gray-200 p-3 hover:border-emerald-400 hover:bg-emerald-50"
        >
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-emerald-600" />
            <div>
              <div className="text-lg font-bold text-gray-900">
                {sales === null ? "…" : sales}
              </div>
              <div className="text-xs text-gray-500">Реалізації</div>
            </div>
          </div>
        </OpenTabLink>
      </div>
    </Card>
  );
}

function NoteWidget({
  text,
  editable,
  onChange,
}: {
  text: string;
  editable: boolean;
  onChange: (text: string) => void;
}) {
  return (
    <Card title="Нотатка">
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        disabled={!editable}
        maxLength={2000}
        placeholder="Особисті нотатки…"
        className="h-28 w-full resize-y rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-800 focus:border-emerald-400 focus:outline-none disabled:bg-gray-50"
      />
    </Card>
  );
}

function TopClientsWidget({ stats }: { stats: FinanceStats }) {
  return (
    <Card title={`Топ-10 клієнтів (${stats.period.label.toLowerCase()})`}>
      {stats.topClients.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-200 p-4 text-center text-sm text-gray-500">
          За цей період реалізацій немає.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs tracking-wide text-gray-500 uppercase">
              <tr>
                <th className="px-2 py-1.5">#</th>
                <th className="px-2 py-1.5">Клієнт</th>
                <th className="px-2 py-1.5 text-right">Виручка, €</th>
                <th className="px-2 py-1.5 text-right">Реаліз.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats.topClients.map((c, idx) => (
                <tr key={c.id}>
                  <td className="px-2 py-1.5 text-gray-500">{idx + 1}</td>
                  <td className="px-2 py-1.5 text-gray-900">{c.name}</td>
                  <td className="px-2 py-1.5 text-right font-medium">
                    {eurFmt(c.revenueEur)}
                  </td>
                  <td className="px-2 py-1.5 text-right text-gray-600">
                    {c.salesCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
