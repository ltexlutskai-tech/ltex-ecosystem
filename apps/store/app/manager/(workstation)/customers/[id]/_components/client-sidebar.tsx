"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import {
  ClientAddressLink,
  ClientWebsiteLink,
  NovaPoshtaBranchLink,
} from "./client-address-link";
import { ClientNextStep } from "./client-next-step";
import { ClientPhonesSection } from "./client-phones-section";
import { ClientSocialTab } from "./client-social-tab";
import type { ClientDetail } from "./types";

/** Стабільна палітра тега (той самий колір, що у вкладці «Ключові слова»). */
const TAG_PALETTE = [
  "bg-blue-100 text-blue-800",
  "bg-green-100 text-green-800",
  "bg-purple-100 text-purple-800",
  "bg-amber-100 text-amber-800",
  "bg-pink-100 text-pink-800",
  "bg-cyan-100 text-cyan-800",
  "bg-rose-100 text-rose-800",
  "bg-teal-100 text-teal-800",
] as const;

function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i += 1) {
    hash = (hash * 31 + tag.charCodeAt(i)) & 0xffffffff;
  }
  return (
    TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length] ??
    "bg-gray-100 text-gray-800"
  );
}

function parseKeywords(raw: string | null): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

/** Згортна секція «візитки» — стан (відкрита/згорнута) у localStorage. */
function SidebarSection({
  id,
  title,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const storageKey = `ltex:ccard-sec:${id}`;
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === "0") setOpen(false);
      else if (saved === "1") setOpen(true);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold tracking-wide text-gray-500 uppercase"
      >
        <span>{title}</span>
        <ChevronDown
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

/** Рядок «ключ: значення» read-only. Порожні значення показуємо як «—». */
function KV({ k, v }: { k: string; v: ReactNode }) {
  const empty = v == null || v === "" || v === "—";
  return (
    <div className="flex gap-2 py-0.5 text-[13px]">
      <span className="w-28 shrink-0 text-gray-500">{k}</span>
      <span className={empty ? "text-gray-400" : "font-medium text-gray-800"}>
        {empty ? "—" : v}
      </span>
    </div>
  );
}

function goToTab(hash: string) {
  if (typeof window !== "undefined") window.location.hash = hash;
}

export function ClientSidebar({
  client,
  canEdit,
  isForeign,
}: {
  client: ClientDetail;
  canEdit: boolean;
  isForeign: boolean;
}) {
  const tags = parseKeywords(client.keywords);
  const lastPurchase =
    client.daysSinceLastPurchase != null
      ? client.daysSinceLastPurchase === 0
        ? "сьогодні"
        : `${client.daysSinceLastPurchase} дн. тому`
      : client.lastPurchaseAt
        ? new Date(client.lastPurchaseAt).toLocaleDateString("uk-UA")
        : "—";

  return (
    <div className="space-y-2.5">
      <ClientNextStep reminders={client.reminders} />

      {/* Контакти — телефони + месенджери, завжди в лівій колонці */}
      <SidebarSection id="contacts" title="Контакти">
        <ClientPhonesSection
          clientId={client.id}
          phones={client.phones}
          phonePrimary={client.phonePrimary}
          isForeign={isForeign}
          canEdit={canEdit}
          bare
        />
        {!isForeign && (
          <div className="mt-2 border-t pt-2">
            <ClientSocialTab
              client={client}
              canEdit={canEdit}
              isForeign={isForeign}
              bare
            />
          </div>
        )}
      </SidebarSection>

      {/* Адреса й доставка */}
      <SidebarSection id="address" title="Адреса й доставка">
        <KV
          k="Адреса"
          v={
            client.region || client.city || client.street ? (
              <ClientAddressLink
                region={client.region}
                city={client.city}
                street={client.street}
                house={client.house}
              />
            ) : (
              "—"
            )
          }
        />
        <KV k="Доставка" v={client.deliveryMethod?.label ?? "—"} />
        <KV
          k="Відділення НП"
          v={
            client.novaPoshtaBranch ? (
              <span className="inline-flex items-center gap-1">
                <NovaPoshtaBranchLink
                  branch={client.novaPoshtaBranch}
                  city={client.city}
                />
                {client.npAddressMatchedAt && (
                  <span className="text-green-600" title="Адресу НП звірено">
                    ✓
                  </span>
                )}
              </span>
            ) : (
              "—"
            )
          }
        />
        <KV k="Маршрут" v={client.primaryRoute?.name ?? "—"} />
      </SidebarSection>

      {/* Ключові слова — read-only чипи + перехід на вкладку для редагування */}
      <SidebarSection id="keywords" title="Ключові слова">
        {tags.length === 0 ? (
          <p className="text-[13px] text-gray-400">Не вказано.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Link
                key={tag}
                href={`/manager/customers?keywords=${encodeURIComponent(tag)}`}
                className={`rounded-full px-2 py-0.5 text-xs hover:underline ${tagColor(tag)}`}
                title={`Показати клієнтів з тегом «${tag}»`}
              >
                {tag}
              </Link>
            ))}
          </div>
        )}
        {!isForeign && canEdit && (
          <button
            type="button"
            onClick={() => goToTab("keywords")}
            className="mt-2 text-xs font-medium text-blue-600 hover:underline"
          >
            Редагувати →
          </button>
        )}
      </SidebarSection>

      {/* Огляд — ключові поля клієнта */}
      <SidebarSection id="overview" title="Огляд">
        <KV k="Тип цін" v={client.priceType?.label ?? "—"} />
        <KV k="Категорія ТТ" v={client.categoryTT?.label ?? "—"} />
        <KV k="Канал" v={client.searchChannel?.label ?? "—"} />
        <KV k="Асортимент" v={client.primaryAssortment?.label ?? "—"} />
        <KV
          k="Обсяг/міс"
          v={client.monthlyVolume ? `${client.monthlyVolume} кг` : "—"}
        />
        <KV k="Ост. покупка" v={lastPurchase} />
        {client.parentClient && (
          <KV
            k="Головний"
            v={
              <Link
                href={`/manager/customers/${client.parentClient.id}`}
                className="text-blue-600 hover:underline"
              >
                {client.parentClient.name}
              </Link>
            }
          />
        )}
        {client.childClients.length > 0 && (
          <KV k="Філій" v={`${client.childClients.length}`} />
        )}
      </SidebarSection>

      {/* Реквізити (коротко) + перехід на повну вкладку */}
      <SidebarSection
        id="requisites-short"
        title="Реквізити"
        defaultOpen={false}
      >
        <KV k="Код" v={client.code1C ?? "—"} />
        <KV k="Тип особи" v={client.legalType ?? "—"} />
        <KV k="ІНН" v={client.inn ?? "—"} />
        <KV k="ЄДРПОУ" v={client.edrpou ?? "—"} />
        <KV k="Повна назва" v={client.fullName ?? "—"} />
        {client.websiteUrl && (
          <KV k="Сайт" v={<ClientWebsiteLink url={client.websiteUrl} />} />
        )}
        <button
          type="button"
          onClick={() => goToTab("requisites")}
          className="mt-2 text-xs font-medium text-blue-600 hover:underline"
        >
          Усі реквізити →
        </button>
      </SidebarSection>
    </div>
  );
}
