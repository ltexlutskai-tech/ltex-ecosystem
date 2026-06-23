"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@ltex/ui";
import { useClientEdit } from "../_hooks/use-client-edit";
import { useDiscardWarning } from "../_hooks/use-discard-warning";
import { patchClient } from "@/lib/manager/client-patch-fetch";
import { formatEur, parseDecimal } from "../../_components/format";
import type { EditDictionaries } from "../_lib/load-edit-dictionaries";
import type { ClientDetail } from "./types";
import { EditTextRow } from "./edit-controls/edit-text-row";
import { EditNumberRow } from "./edit-controls/edit-number-row";
import { EditDateRow } from "./edit-controls/edit-date-row";
import { EditBoolRow } from "./edit-controls/edit-bool-row";
import { EditSelectRow } from "./edit-controls/edit-select-row";
import { ReadonlyRow } from "./edit-controls/readonly-row";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("uk-UA");
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("uk-UA");
}

function fmtMoney(value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  return formatEur(value);
}

function DebtValue({
  value,
  muted = false,
}: {
  value: string | null;
  muted?: boolean;
}) {
  const n = parseDecimal(value);
  if (value == null || value === "")
    return <span className="text-gray-400">—</span>;
  if (muted) {
    return (
      <span className={n > 0 ? "text-orange-700" : "text-gray-700"}>
        {formatEur(value)}
      </span>
    );
  }
  return (
    <span
      className={
        n > 0 ? "text-red-700" : n < 0 ? "text-green-700" : "text-gray-700"
      }
    >
      {formatEur(value)}
    </span>
  );
}

interface Props {
  client: ClientDetail;
  dictionaries: EditDictionaries;
  currentUserRole:
    | "manager"
    | "senior_manager"
    | "admin"
    | "owner"
    | "supervisor"
    | "analyst"
    | "warehouse"
    | "expeditor"
    | "bookkeeper";
  onCancel: () => void;
  onSaved: () => void;
}

export function ClientRequisitesEdit({
  client,
  dictionaries,
  currentUserRole,
  onCancel,
  onSaved,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const { values, isDirty, setField, reset, diff } = useClientEdit(client);
  const [saving, setSaving] = useState(false);

  useDiscardWarning(isDirty);

  const isAdmin = currentUserRole === "admin";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isDirty) {
      onSaved();
      return;
    }
    setSaving(true);
    try {
      const payload = diff();
      const res = await patchClient(client.id, payload);
      if (!res.ok) {
        toast({
          description: res.error ?? "Не вдалося зберегти",
          variant: "destructive",
        });
        return;
      }
      toast({ description: "Збережено" });
      router.refresh();
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (isDirty) {
      const ok = window.confirm("Скасувати правки?");
      if (!ok) return;
    }
    reset();
    onCancel();
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={saving}
            className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isDirty ? "Скасувати правки" : "Скасувати"}
          </button>
          <button
            type="submit"
            disabled={!isDirty || saving}
            className="rounded-md border border-transparent bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {saving ? "Збереження..." : "Зберегти"}
          </button>
        </div>

        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
          <ReadonlyRow label="Код" value={client.code1C ?? "—"} />
          <ReadonlyRow label="Створений" value={fmtDate(client.createdAt)} />

          <EditTextRow
            label="Найменування"
            value={values.name}
            onChange={(v) => setField("name", v ?? "")}
            required
            maxLength={255}
          />
          <EditTextRow
            label="Торгова точка"
            value={values.tradePointName}
            onChange={(v) => setField("tradePointName", v)}
            maxLength={255}
          />

          <EditTextRow
            label="Повна назва"
            value={values.fullName}
            onChange={(v) => setField("fullName", v)}
            maxLength={255}
          />
          <EditTextRow
            label="Тип особи"
            value={values.legalType}
            onChange={(v) => setField("legalType", v)}
            maxLength={50}
          />

          <EditTextRow
            label="Email"
            value={values.email}
            onChange={(v) => setField("email", v)}
            type="text"
            placeholder="client@example.com"
            maxLength={255}
          />
          <EditTextRow
            label="Графік роботи"
            value={values.workingHours}
            onChange={(v) => setField("workingHours", v)}
            maxLength={255}
          />

          <EditTextRow
            label="ІНН"
            value={values.inn}
            onChange={(v) => setField("inn", v)}
            maxLength={50}
          />
          <EditTextRow
            label="ЄДРПОУ"
            value={values.edrpou}
            onChange={(v) => setField("edrpou", v)}
            maxLength={50}
          />

          <EditTextRow
            label="Код голови-клієнта (1С)"
            value={values.parentCode1C}
            onChange={(v) => setField("parentCode1C", v)}
            maxLength={50}
          />

          <ReadonlyRow
            label="Борг"
            value={<DebtValue value={client.debt} />}
            hint="Розраховується з документів 1С"
          />
          <ReadonlyRow
            label="Протерміновано"
            value={<DebtValue value={client.overdueDebt} muted />}
            hint="Розраховується з документів 1С"
          />
          <ReadonlyRow
            label="Борг ТОВ"
            value={<DebtValue value={client.tovDebt} />}
            hint="Розраховується з документів 1С"
          />
          <ReadonlyRow
            label="Просрочено ТОВ"
            value={<DebtValue value={client.tovOverdueDebt} muted />}
            hint="Розраховується з документів 1С"
          />

          <EditSelectRow
            label="Статус"
            value={values.statusGeneralId}
            onChange={(v) => setField("statusGeneralId", v)}
            options={dictionaries.statuses}
          />
          <ReadonlyRow
            label="Оперативний статус"
            value={
              <span className="inline-flex items-center gap-1.5">
                {client.statusOperational ? (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                    style={{
                      backgroundColor: client.statusOperational.colorHex,
                    }}
                  >
                    {client.statusOperational.label}
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
                <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                  авто
                </span>
              </span>
            }
            hint="Обчислюється автоматично за продажами цього місяця"
          />

          <EditSelectRow
            label="Асортимент"
            value={values.primaryAssortmentId}
            onChange={(v) => setField("primaryAssortmentId", v)}
            options={dictionaries.assortmentCodes}
          />

          <EditSelectRow
            label="Спосіб доставки"
            value={values.deliveryMethodId}
            onChange={(v) => setField("deliveryMethodId", v)}
            options={dictionaries.deliveryMethods}
          />
          <EditSelectRow
            label="Категорія ТТ"
            value={values.categoryTTId}
            onChange={(v) => setField("categoryTTId", v)}
            options={dictionaries.categoriesTT}
          />

          <EditTextRow
            label="Область"
            value={values.region}
            onChange={(v) => setField("region", v)}
            maxLength={100}
          />
          <EditTextRow
            label="Місто"
            value={values.city}
            onChange={(v) => setField("city", v)}
            maxLength={100}
          />
          <EditTextRow
            label="Вулиця"
            value={values.street}
            onChange={(v) => setField("street", v)}
            maxLength={255}
          />
          <EditTextRow
            label="Будинок"
            value={values.house}
            onChange={(v) => setField("house", v)}
            maxLength={50}
          />

          <EditTextRow
            label="Відділення НП"
            value={values.novaPoshtaBranch}
            onChange={(v) => setField("novaPoshtaBranch", v)}
            maxLength={50}
          />
          <EditTextRow
            label="Сайт"
            value={values.websiteUrl}
            onChange={(v) => setField("websiteUrl", v)}
            type="url"
            placeholder="https://example.com"
            maxLength={500}
          />

          <EditTextRow
            label="Геолокація"
            value={values.geolocation}
            onChange={(v) => setField("geolocation", v)}
            placeholder="50.7472,25.3254"
            maxLength={100}
          />
          <EditNumberRow
            label="Обсяг за місяць"
            value={values.monthlyVolume}
            onChange={(v) => setField("monthlyVolume", v)}
            min={0}
            step={0.01}
            suffix="кг"
          />

          <EditSelectRow
            label="Канал пошуку"
            value={values.searchChannelId}
            onChange={(v) => setField("searchChannelId", v)}
            options={dictionaries.searchChannels}
          />
          <EditTextRow
            label="Контакт Viber"
            value={values.viberContact}
            onChange={(v) => setField("viberContact", v)}
            type="tel"
            placeholder="+380501112233"
            maxLength={50}
          />

          <EditSelectRow
            label="Торговий агент"
            value={values.agentUserId}
            onChange={(v) => setField("agentUserId", v)}
            options={dictionaries.agents}
            disabled={!isAdmin}
            disabledHint="Тільки адміністратор може змінювати торгового агента"
          />
          <EditDateRow
            label="Ліцензія дійсна до"
            value={values.licenseExpiresAt}
            onChange={(v) => setField("licenseExpiresAt", v)}
          />

          <ReadonlyRow
            label="Залишок сесії"
            value={fmtMoney(client.sessionRemainder)}
          />
          <ReadonlyRow
            label="Оновлено з 1С"
            value={fmtDateTime(client.lastSyncedAt)}
          />

          <EditSelectRow
            label="Основний маршрут"
            value={values.primaryRouteId}
            onChange={(v) => setField("primaryRouteId", v)}
            options={dictionaries.routes}
          />
          <EditTextRow
            label="Статус діалогу"
            value={values.dialogStatus}
            onChange={(v) => setField("dialogStatus", v)}
            maxLength={100}
          />

          <EditBoolRow
            label="Нове повідомлення"
            value={values.hasNewMessage}
            onChange={(v) => setField("hasNewMessage", v)}
          />
          <EditBoolRow
            label="Підписаний у Viber"
            value={values.isViberLinked}
            onChange={(v) => setField("isViberLinked", v)}
          />

          <div className="sm:col-span-2">
            <EditTextareaRow
              label="Коментар"
              value={values.comment}
              onChange={(v) => setField("comment", v)}
              maxLength={1000}
            />
          </div>
          <div className="sm:col-span-2">
            <EditTextareaRow
              label="Додатковий опис"
              value={values.additionalDescription}
              onChange={(v) => setField("additionalDescription", v)}
              maxLength={1000}
            />
          </div>
        </dl>
      </section>
    </form>
  );
}

function EditTextareaRow({
  label,
  value,
  onChange,
  maxLength,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  maxLength?: number;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <dt className="w-44 shrink-0 pt-1.5 text-gray-500">{label}:</dt>
      <dd className="min-w-0 flex-1">
        <textarea
          value={value ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? null : v);
          }}
          rows={3}
          maxLength={maxLength}
          className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
        />
      </dd>
    </div>
  );
}
