"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Input } from "@ltex/ui";

type DictItem = { id: string; code?: string; label?: string };
type AgentItem = { id: string; fullName: string };

interface Props {
  priceTypes: { id: string; code: string; label: string }[];
  agents: AgentItem[];
  userRole: "manager" | "senior_manager" | "admin";
}

export function CreateClientForm({ priceTypes, agents, userRole }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    code1C: "",
    phonePrimary: "",
    tradePointName: "",
    region: "",
    city: "",
    priceTypeId: "",
    agentUserId: "",
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

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
      if (form.code1C.trim()) body.code1C = form.code1C.trim();
      if (form.phonePrimary.trim())
        body.phonePrimary = form.phonePrimary.trim();
      if (form.tradePointName.trim())
        body.tradePointName = form.tradePointName.trim();
      if (form.region.trim()) body.region = form.region.trim();
      if (form.city.trim()) body.city = form.city.trim();
      if (form.priceTypeId) body.priceTypeId = form.priceTypeId;
      if (form.agentUserId) body.agentUserId = form.agentUserId;

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
      <Field label="Назва *" required>
        <Input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="ФОП Іваненко І.І. / ТОВ Магазин"
          autoFocus
          required
          maxLength={255}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Код 1С">
          <Input
            value={form.code1C}
            onChange={(e) => set("code1C", e.target.value)}
            placeholder="наприклад 000005798"
            maxLength={50}
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
      </div>

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

      <Field label="Тип цін">
        <SelectNative
          value={form.priceTypeId}
          onChange={(v) => set("priceTypeId", v)}
          options={[
            { value: "", label: "— не обрано —" },
            ...priceTypes.map((p: DictItem) => ({
              value: p.id,
              label: p.label ?? p.code ?? p.id,
            })),
          ]}
        />
      </Field>

      {userRole === "admin" && (
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
        Після створення клієнт автоматично синхронізується з 1С (Контрагент
        додасться/оновиться через кілька хвилин).
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
