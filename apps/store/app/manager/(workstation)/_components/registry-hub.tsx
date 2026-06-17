import Link from "next/link";
import { type ReactNode } from "react";
import {
  ArrowRight,
  Bell,
  Coins,
  Database,
  FileText,
  Landmark,
  Layers,
  MapPin,
  Package,
  PieChart,
  Receipt,
  Route,
  Ruler,
  Tag,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";
import type {
  DictionaryEntry,
  RegisterEntry,
  ReportEntry,
  RegistryStatus,
} from "@/lib/manager/registry-catalog";

type IconCmp = (props: { className?: string }) => ReactNode;

const DICT_ICONS: Record<string, IconCmp> = {
  clients: Users,
  products: Package,
  price_types: Tag,
  cash_flow_articles: Receipt,
  bank_accounts: Landmark,
  routes: Route,
  client_statuses: Layers,
  search_channels: MapPin,
  categories_tt: Layers,
  delivery_methods: Route,
  message_templates: FileText,
  reminders: Bell,
  units: Ruler,
  cities: MapPin,
  regions: MapPin,
  trade_agents: Users,
};

const REGISTER_ICONS: Record<string, IconCmp> = {
  debt: Wallet,
  sales: PieChart,
  cash_flow: Coins,
  stock: Warehouse,
  order_balances: Package,
  cost: Coins,
  exchange_rates: Coins,
};

function StatusBadge({
  status,
  phase,
}: {
  status: RegistryStatus;
  phase?: number;
}) {
  if (status === "ready") {
    return (
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        Готово
      </span>
    );
  }
  if (status === "partial") {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        частково
      </span>
    );
  }
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
      {phase ? `Фаза ${phase} · скоро` : "скоро"}
    </span>
  );
}

interface CardData {
  key: string;
  label: string;
  description: string;
  href: string | null;
  status: RegistryStatus;
  phase?: number;
  icon: IconCmp;
}

function ObjectCard({ card }: { card: CardData }) {
  const Icon = card.icon;
  const clickable = card.href !== null;

  const inner = (
    <>
      <div className="mb-2 flex items-start justify-between gap-2">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-md ${
            clickable
              ? "bg-emerald-50 text-emerald-600"
              : "bg-gray-100 text-gray-400"
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <StatusBadge status={card.status} phase={card.phase} />
      </div>
      <div className="text-sm font-semibold text-gray-800">{card.label}</div>
      <p className="mt-0.5 text-xs leading-snug text-gray-500">
        {card.description}
      </p>
    </>
  );

  if (clickable && card.href) {
    return (
      <Link
        href={card.href}
        className="block rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:border-emerald-300 hover:bg-emerald-50/30"
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 p-3">
      {inner}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
  action,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {children}
      </div>
    </section>
  );
}

export function RegistryHub({
  dictionaries,
  registers,
  reports,
}: {
  dictionaries: readonly DictionaryEntry[];
  registers: readonly RegisterEntry[];
  reports: readonly ReportEntry[];
}) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          Довідники та регістри
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Усі об'єкти обліку: довідники, регістри рухів та звіти.
        </p>
      </div>

      <Section
        title="Довідники"
        icon={<Database className="h-4 w-4 text-gray-400" />}
      >
        {dictionaries.map((d) => (
          <ObjectCard
            key={d.key}
            card={{ ...d, icon: DICT_ICONS[d.key] ?? Layers }}
          />
        ))}
      </Section>

      <Section
        title="Регістри"
        icon={<Layers className="h-4 w-4 text-gray-400" />}
      >
        {registers.map((r) => (
          <ObjectCard
            key={r.key}
            card={{ ...r, icon: REGISTER_ICONS[r.key] ?? Layers }}
          />
        ))}
      </Section>

      <Section
        title="Звіти"
        icon={<PieChart className="h-4 w-4 text-gray-400" />}
        action={
          <Link
            href="/manager/reports"
            className="flex items-center gap-1 text-sm font-medium text-emerald-700 hover:text-emerald-800"
          >
            Усі звіти
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      >
        {reports.map((r) => (
          <ObjectCard
            key={r.key}
            card={{
              ...r,
              status: "ready",
              icon: PieChart,
            }}
          />
        ))}
      </Section>
    </div>
  );
}
