"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

interface InitialFilters {
  q?: string;
  role?: string;
  action?: string;
  resource?: string;
  ownerOnly?: string;
  from?: string;
  to?: string;
}

const ROLES = [
  "manager",
  "senior_manager",
  "admin",
  "owner",
  "supervisor",
  "analyst",
  "warehouse",
  "bookkeeper",
];
const ACTIONS = [
  "create",
  "update",
  "delete",
  "login",
  "logout",
  "failed_login",
  "password_reset",
  "permission_change",
  "export",
  "post",
];

export function AuditFilters({ initial }: { initial: InitialFilters }) {
  const router = useRouter();
  const sp = useSearchParams();

  const [q, setQ] = useState(initial.q ?? "");
  const [role, setRole] = useState(initial.role ?? "");
  const [action, setAction] = useState(initial.action ?? "");
  const [resource, setResource] = useState(initial.resource ?? "");
  const [from, setFrom] = useState(initial.from ?? "");
  const [to, setTo] = useState(initial.to ?? "");
  const ownerOnly = sp.get("ownerOnly") === "true";

  function apply() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (role) params.set("role", role);
    if (action) params.set("action", action);
    if (resource) params.set("resource", resource);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (ownerOnly) params.set("ownerOnly", "true");
    router.push(`/manager/admin/audit?${params.toString()}`);
  }

  function reset() {
    router.push("/manager/admin/audit");
  }

  function toggleOwnerOnly() {
    const params = new URLSearchParams(sp.toString());
    if (ownerOnly) params.delete("ownerOnly");
    else params.set("ownerOnly", "true");
    router.push(`/manager/admin/audit?${params.toString()}`);
  }

  return (
    <div className="rounded-md border bg-white p-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <input
          type="search"
          placeholder="Пошук в описі…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
        >
          <option value="">— Усі ролі —</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
        >
          <option value="">— Усі дії —</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Ресурс (order/client/...)"
          value={resource}
          onChange={(e) => setResource(e.target.value)}
          className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
        />
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
          placeholder="з"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
          placeholder="до"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={apply}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
        >
          Застосувати
        </button>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-gray-400"
        >
          Скинути
        </button>
        <label className="ml-auto inline-flex items-center gap-1.5 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={ownerOnly}
            onChange={toggleOwnerOnly}
            className="rounded border-gray-300"
          />
          Тільки дії власника
        </label>
      </div>
    </div>
  );
}
