"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, MoreVertical, Phone } from "lucide-react";
import {
  buildSocialUrl,
  formatPhoneUkr,
  phoneToTelUrl,
  phoneToViberUrl,
  phoneToWhatsAppUrl,
  socialNetworkLabel,
} from "@ltex/shared";
import { useToast } from "@ltex/ui";
import { BackButton } from "../../../_components/back-button";
import { BrandIcon } from "../../../_components/brand-icons";
import { ClientStatusBadge } from "../../_components/client-status-badge";
import { DiscussButton } from "../../../messenger/_components/discuss-button";
import { formatEur, parseDecimal } from "../../_components/format";
import { ClientAssignDialog } from "./client-assign-dialog";
import { ClientForeignBanner } from "./client-foreign-banner";
import { ClientMarkDeletionButton } from "./client-mark-deletion-button";
import { ClientVideoOrderButton } from "./client-video-order-button";
import type { ClientDetail } from "./types";

/** Компактні кнопки швидкого зв'язку для номера (дзвінок / Viber / WhatsApp). */
function QuickDial({ phone }: { phone: string }) {
  const telUrl = phoneToTelUrl(phone);
  const viberUrl = phoneToViberUrl(phone);
  const whatsAppUrl = phoneToWhatsAppUrl(phone);
  return (
    <span className="inline-flex items-center gap-1">
      {telUrl && (
        <a
          href={telUrl}
          aria-label="Подзвонити"
          title="Подзвонити"
          className="flex h-6 w-6 items-center justify-center rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
        >
          <Phone className="h-3.5 w-3.5" />
        </a>
      )}
      {viberUrl && (
        <a
          href={viberUrl}
          aria-label="Viber"
          title="Viber"
          className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-50 hover:bg-purple-100"
        >
          <BrandIcon kind="viber" className="h-4 w-4" />
        </a>
      )}
      {whatsAppUrl && (
        <a
          href={whatsAppUrl}
          target="_blank"
          rel="noopener"
          aria-label="WhatsApp"
          title="WhatsApp"
          className="flex h-6 w-6 items-center justify-center rounded-md bg-green-50 hover:bg-green-100"
        >
          <BrandIcon kind="whatsapp" className="h-4 w-4" />
        </a>
      )}
    </span>
  );
}

/** Дропдоун «ще N номерів» — усі телефони клієнта з кнопками швидкого зв'язку. */
function MorePhones({
  phonePrimary,
  phones,
}: {
  phonePrimary: string | null;
  phones: ClientDetail["phones"];
}) {
  const [open, setOpen] = useState(false);
  if (phones.length === 0) return null;
  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
      >
        ще {phones.length} <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            role="presentation"
          />
          <div className="absolute top-6 left-0 z-40 w-72 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
            {phonePrimary && (
              <div className="flex items-center gap-2 border-b border-gray-100 py-1.5">
                <span className="font-mono text-xs text-gray-800">
                  {formatPhoneUkr(phonePrimary)}
                </span>
                <span className="text-[10px] text-gray-400">(основний)</span>
                <span className="ml-auto">
                  <QuickDial phone={phonePrimary} />
                </span>
              </div>
            )}
            {phones.map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-1.5">
                <span className="font-mono text-xs text-gray-800">
                  {formatPhoneUkr(p.phone)}
                </span>
                {p.label && (
                  <span className="text-[10px] text-gray-400">({p.label})</span>
                )}
                <span className="ml-auto">
                  <QuickDial phone={p.phone} />
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

/** Меню «⋮» — другорядні дії (про борг / позначити на вилучення). */
function HeaderMenu({
  clientId,
  canEdit,
  isForeign,
}: {
  clientId: string;
  canEdit: boolean;
  isForeign: boolean;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const showDebt = !isForeign;
  const showDelete = canEdit && !isForeign;
  if (!showDebt && !showDelete) return null;
  return (
    <span className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Ще дії"
        title="Ще дії"
        className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
            role="presentation"
          />
          <div className="absolute top-9 right-0 z-40 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {showDebt && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  toast({
                    description:
                      "Чат-інтеграцію (Viber/Telegram повідомлення про борг) зробимо у M1.8",
                  });
                }}
                className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                Повідомити про борг
              </button>
            )}
            {showDelete && (
              <ClientMarkDeletionButton
                clientId={clientId}
                renderTrigger={(openDialog) => (
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      openDialog();
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                  >
                    Позначити на вилучення
                  </button>
                )}
              />
            )}
          </div>
        </>
      )}
    </span>
  );
}

export function ClientHeaderBar({
  client,
  canEdit,
  canAssign,
  customerId,
}: {
  client: ClientDetail;
  canEdit: boolean;
  canAssign: boolean;
  /** `Customer.id` (дзеркало по code1C) для prefill Замовлення/Реалізації. */
  customerId: string | null;
}) {
  const isForeign = client.viewerOwnership === "foreign";
  const debtN = parseDecimal(client.debt);
  const managerName =
    client.assignedManager?.fullName ?? client.agent?.fullName ?? null;

  const orderHref = customerId
    ? `/manager/orders/new?clientId=${encodeURIComponent(customerId)}`
    : "/manager/orders/new";
  const saleHref = customerId
    ? `/manager/sales/new?clientId=${encodeURIComponent(customerId)}`
    : "/manager/sales/new";
  const paymentHref = `/manager/payments/new?clientId=${encodeURIComponent(client.id)}`;

  const actionBtn =
    "inline-flex h-8 items-center justify-center rounded-md border border-gray-300 bg-white px-2.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap";

  return (
    <div className="space-y-2">
      {isForeign && (
        <ClientForeignBanner agentName={client.agent?.fullName ?? null} />
      )}
      <header className="rounded-xl border bg-white px-3 py-2 shadow-sm">
        {/* Рядок 1 — ім'я, статуси, борг, менеджер, дії-меню */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <BackButton
            fallbackHref="/manager/customers"
            label=""
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
          />
          <h1 className="max-w-[22ch] truncate text-lg font-bold text-gray-900 sm:max-w-[34ch]">
            {client.name}
          </h1>
          <ClientStatusBadge status={client.statusGeneral} />
          {client.statusOperational && (
            <span className="hidden rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 sm:inline">
              📞 {client.statusOperational.label} · цей місяць
            </span>
          )}

          <div className="ml-auto flex items-center gap-2.5">
            <span className="whitespace-nowrap text-sm text-gray-600">
              Борг:{" "}
              <span
                className={
                  debtN > 0
                    ? "font-semibold text-red-700"
                    : debtN < 0
                      ? "font-semibold text-green-700"
                      : "font-semibold text-gray-700"
                }
              >
                {formatEur(client.debt)}
              </span>
            </span>
            <span className="hidden whitespace-nowrap text-sm text-gray-600 lg:inline">
              Менеджер:{" "}
              <span className="font-medium text-gray-800">
                {managerName ?? (
                  <em className="font-normal text-gray-400">не призначено</em>
                )}
              </span>
            </span>
            {canAssign && (
              <ClientAssignDialog
                clientId={client.id}
                currentManager={client.assignedManager}
              />
            )}
            <DiscussButton
              docRef={{
                type: "client",
                label: client.name,
                subtitle: client.city ?? undefined,
                url: `/manager/customers/${client.id}`,
              }}
            />
            <HeaderMenu
              clientId={client.id}
              canEdit={canEdit}
              isForeign={isForeign}
            />
          </div>
        </div>

        {/* Рядок 2 — локація, телефони, месенджери + кнопки дій */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t pt-1.5">
          {(client.region || client.city) && (
            <span className="whitespace-nowrap text-xs text-gray-500">
              📍 {[client.region, client.city].filter(Boolean).join(" · ")}
            </span>
          )}

          {client.phonePrimary && (
            <span className="flex items-center gap-1.5">
              <span className="font-mono text-[13px] font-medium text-gray-800">
                {isForeign
                  ? client.phonePrimary
                  : formatPhoneUkr(client.phonePrimary)}
              </span>
              {!isForeign && <QuickDial phone={client.phonePrimary} />}
            </span>
          )}
          {!isForeign && (
            <MorePhones
              phonePrimary={client.phonePrimary}
              phones={client.phones}
            />
          )}

          {!isForeign && client.messengers.length > 0 && (
            <span className="flex items-center gap-1">
              {client.messengers.slice(0, 6).map((m) => {
                const url = buildSocialUrl(
                  m.network,
                  m.handle,
                  m.browserUrl ?? m.url,
                );
                if (!url) return null;
                return (
                  <a
                    key={m.id}
                    href={url}
                    target={url.startsWith("viber://") ? undefined : "_blank"}
                    rel="noopener"
                    aria-label={socialNetworkLabel(m.network)}
                    title={socialNetworkLabel(m.network)}
                    className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-gray-100"
                  >
                    <BrandIcon kind={m.network} className="h-4 w-4" />
                  </a>
                );
              })}
            </span>
          )}

          <div className="ml-auto flex flex-nowrap items-center gap-1.5 overflow-x-auto">
            <Link href={orderHref} className={actionBtn}>
              + Замовлення
            </Link>
            <Link href={saleHref} className={actionBtn}>
              + Реалізація
            </Link>
            <Link href={paymentHref} className={actionBtn}>
              + Оплата
            </Link>
            <ClientVideoOrderButton
              clientId={client.id}
              triggerClassName="h-8 px-2.5 text-[13px]"
              triggerLabel="🎥 Відео"
            />
          </div>
        </div>
      </header>
    </div>
  );
}
