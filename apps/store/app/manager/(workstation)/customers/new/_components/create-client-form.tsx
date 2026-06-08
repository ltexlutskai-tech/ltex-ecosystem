"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input, Textarea } from "@ltex/ui";

type DictItem = { id: string; code?: string; label?: string };
type AgentItem = { id: string; fullName: string };

interface DuplicateHit {
  id: string;
  name: string;
  city: string | null;
  agent: { id: string; fullName: string } | null;
}

interface Props {
  priceTypes: DictItem[];
  searchChannels: DictItem[];
  categoriesTT: DictItem[];
  assortmentCodes: DictItem[];
  agents: AgentItem[];
  userRole:
    | "manager"
    | "senior_manager"
    | "admin"
    | "owner"
    | "supervisor"
    | "analyst"
    | "warehouse"
    | "bookkeeper";
}

export function CreateClientForm({
  priceTypes,
  searchChannels,
  categoriesTT,
  assortmentCodes,
  agents,
  userRole,
}: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneDuplicates, setPhoneDuplicates] = useState<DuplicateHit[]>([]);
  const [form, setForm] = useState({
    name: "",
    phonePrimary: "",
    tradePointName: "",
    region: "",
    city: "",
    novaPoshtaBranch: "",
    priceTypeId: "",
    searchChannelId: "",
    categoryTTId: "",
    primaryAssortmentId: "",
    agentUserId: "",
    initialComment: "",
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Дебаунсована перевірка телефону — якщо знайдено хоч одного клієнта зі
  // схожим номером (Code1C: 0978545991 збігається з +380978545991 тощо),
  // показуємо warning з агентом.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const raw = form.phonePrimary.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (raw.length < 4) {
      setPhoneDuplicates([]);
      return;
    }
    // Прибираємо нецифрові символи для пошуку (бо у БД може бути різний формат).
    const digits = raw.replace(/\D/g, "");
    const query = digits.length >= 4 ? digits.slice(-9) : raw;
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/v1/manager/clients/search-all?q=${encodeURIComponent(query)}&pageSize=5`,
        );
        if (!res.ok) {
          setPhoneDuplicates([]);
          return;
        }
        const data = await res.json();
        const hits = Array.isArray(data.items) ? data.items : [];
        setPhoneDuplicates(
          hits.map((c: DuplicateHit) => ({
            id: c.id,
            name: c.name,
            city: c.city,
            agent: c.agent,
          })),
        );
      } catch {
        setPhoneDuplicates([]);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [form.phonePrimary]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError("Введіть назву клієнта");
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, string> = { name: form.name.trim() };
      if (form.phonePrimary.trim())
        body.phonePrimary = form.phonePrimary.trim();
      if (form.tradePointName.trim())
        body.tradePointName = form.tradePointName.trim();
      if (form.region.trim()) body.region = form.region.trim();
      if (form.city.trim()) body.city = form.city.trim();
      if (form.novaPoshtaBranch.trim())
        body.novaPoshtaBranch = form.novaPoshtaBranch.trim();
      if (form.priceTypeId) body.priceTypeId = form.priceTypeId;
      if (form.searchChannelId) body.searchChannelId = form.searchChannelId;
      if (form.categoryTTId) body.categoryTTId = form.categoryTTId;
      if (form.primaryAssortmentId)
        body.primaryAssortmentId = form.primaryAssortmentId;
      if (userRole === "admin") {
        if (form.agentUserId) body.agentUserId = form.agentUserId;
        if (form.initialComment.trim())
          body.initialComment = form.initialComment.trim();
      }

      const res = await fetch("/api/v1/manager/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не вдалося створити клієнта");
        setSubmitting(false);
        return;
      }
      router.push(`/manager/customers/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Невідома помилка");
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
    >
      <Field label="Назва" required>
        <Input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="ФОП Іваненко І.І. / ТОВ Магазин"
          autoFocus
          required
          maxLength={255}
        />
      </Field>

      <Field label="Телефон">
        <Input
          value={form.phonePrimary}
          onChange={(e) => set("phonePrimary", e.target.value)}
          placeholder="+380501234567"
          maxLength={50}
        />
      </Field>

      {phoneDuplicates.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">
            ⚠ Клієнт з цим номером вже зареєстрований:
          </p>
          <ul className="mt-2 space-y-1">
            {phoneDuplicates.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/manager/customers/${c.id}`}
                  className="text-amber-900 underline hover:text-amber-700"
                >
                  {c.name}
                </Link>
                {c.city && <span className="text-amber-800"> · {c.city}</span>}
                {c.agent && (
                  <span className="text-amber-800">
                    {" "}
                    · Менеджер: {c.agent.fullName}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Field label="Назва торгової точки">
        <Input
          value={form.tradePointName}
          onChange={(e) => set("tradePointName", e.target.value)}
          placeholder="Магазин на Привокзальній"
          maxLength={255}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Область">
          <Input
            value={form.region}
            onChange={(e) => set("region", e.target.value)}
            placeholder="Волинська"
            maxLength={100}
          />
        </Field>
        <Field label="Місто">
          <Input
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
            placeholder="Луцьк"
            maxLength={100}
          />
        </Field>
      </div>

      <Field label="Відділення Нової Пошти">
        <Input
          value={form.novaPoshtaBranch}
          onChange={(e) => set("novaPoshtaBranch", e.target.value)}
          placeholder="№42"
          maxLength={50}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Тип цін">
          <DictSelect
            value={form.priceTypeId}
            onChange={(v) => set("priceTypeId", v)}
            items={priceTypes}
          />
        </Field>
        <Field label="Канал пошуку">
          <DictSelect
            value={form.searchChannelId}
            onChange={(v) => set("searchChannelId", v)}
            items={searchChannels}
          />
        </Field>
        <Field label="Категорія ТТ">
          <DictSelect
            value={form.categoryTTId}
            onChange={(v) => set("categoryTTId", v)}
            items={categoriesTT}
          />
        </Field>
        <Field label="Асортимент">
          <DictSelect
            value={form.primaryAssortmentId}
            onChange={(v) => set("primaryAssortmentId", v)}
            items={assortmentCodes}
          />
        </Field>
      </div>

      {userRole === "admin" && (
        <>
          <Field label="Торговий агент">
            <SelectNative
              value={form.agentUserId}
              onChange={(v) => set("agentUserId", v)}
              options={[
                { value: "", label: "— не обрано —" },
                ...agents.map((a) => ({ value: a.id, label: a.fullName })),
              ]}
            />
          </Field>
          <Field label="Коментар для менеджера">
            <Textarea
              value={form.initialComment}
              onChange={(e) => set("initialComment", e.target.value)}
              placeholder="Контекст контакту, побажання клієнта, важливі деталі…"
              maxLength={1000}
              rows={3}
            />
          </Field>
        </>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Створення…" : "Створити клієнта"}
        </Button>
        <Link
          href="/manager/customers"
          className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Скасувати
        </Link>
      </div>

      <p className="text-xs text-gray-500">
        Після створення клієнт автоматично синхронізується з 1С (Код 1С
        проставиться через кілька хвилин, коли Контрагент створиться у 1С базі).
      </p>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function DictSelect({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (v: string) => void;
  items: DictItem[];
}) {
  return (
    <SelectNative
      value={value}
      onChange={onChange}
      options={[
        { value: "", label: "— не обрано —" },
        ...items.map((d) => ({
          value: d.id,
          label: d.label ?? d.code ?? d.id,
        })),
      ]}
    />
  );
}

function SelectNative({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
