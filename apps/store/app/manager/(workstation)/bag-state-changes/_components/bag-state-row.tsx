"use client";

import { ClientPicker } from "../../orders/new/_components/client-picker";
import type { ClientPickerItem } from "../../orders/new/_components/types";

/** Стан одного рядка форми «Зміна стану мішка» (= один мішок). */
export interface BagRow {
  key: string;
  barcode: string;
  productId: string | null;
  productName: string;
  weight: string;
  lotStatus: string | null;
  found: boolean;
  isOpen: boolean;
  hasVideo: boolean;
  isTarget: boolean;
  onAir: boolean;
  onAirDelivery: boolean;
  youtubeUrl: string;
  description: string;
  comment: string;
  reservedAgentUserId: string;
  reservedClientId: string | null;
  reservedClientSummary: ClientPickerItem | null;
  reservedUntil: string;
  /** "" | <sectorId> | "__new__" */
  sectorId: string;
  sectorNew: string;
  lookupError: string | null;
}

export interface AgentOption {
  id: string;
  fullName: string;
}
export interface SectorOption {
  id: string;
  name: string;
}

export function BagStateRowCard({
  row,
  index,
  agents,
  sectors,
  onChange,
  onRemove,
  onRescan,
}: {
  row: BagRow;
  index: number;
  agents: AgentOption[];
  sectors: SectorOption[];
  onChange: (patch: Partial<BagRow>) => void;
  onRemove: () => void;
  onRescan: (code: string) => void;
}) {
  return (
    <div
      className={`rounded-md border p-2 ${
        row.found ? "border-gray-200" : "border-amber-300 bg-amber-50/40"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          № {index + 1}
          {row.productName && (
            <span className="ml-1 font-medium text-gray-700">
              {row.productName}
            </span>
          )}
          {row.weight && (
            <span className="ml-1 text-gray-400">· {row.weight} кг</span>
          )}
          {row.lotStatus && (
            <span className="ml-1 text-gray-400">· {row.lotStatus}</span>
          )}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-red-500 hover:text-red-700"
        >
          Видалити
        </button>
      </div>

      <div className="mt-1 flex gap-2">
        <input
          value={row.barcode}
          onChange={(e) => onChange({ barcode: e.target.value })}
          onBlur={(e) => onRescan(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onRescan(row.barcode);
            }
          }}
          placeholder="Штрихкод мішка"
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Check
          label="Відкрит"
          checked={row.isOpen}
          onChange={(v) => onChange({ isOpen: v })}
        />
        <Check
          label="Є відео"
          checked={row.hasVideo}
          onChange={(v) => onChange({ hasVideo: v })}
        />
        <Check
          label="Цільовий"
          checked={row.isTarget}
          onChange={(v) => onChange({ isTarget: v })}
        />
        <Check
          label="Ефір"
          checked={row.onAir}
          onChange={(v) => onChange({ onAir: v })}
        />
        <Check
          label="Ефір на доставку"
          checked={row.onAirDelivery}
          onChange={(v) => onChange({ onAirDelivery: v })}
        />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input
          value={row.youtubeUrl}
          onChange={(e) => onChange({ youtubeUrl: e.target.value })}
          placeholder="Посилання на YouTube"
          className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        />
        <input
          value={row.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Опис"
          className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        />
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="mb-0.5 block text-xs text-gray-500">
            Бронь (агент)
          </span>
          <select
            value={row.reservedAgentUserId}
            onChange={(e) => onChange({ reservedAgentUserId: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">— Немає —</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.fullName}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className="mb-0.5 block text-xs text-gray-500">Контрагент</span>
          <ClientPicker
            value={row.reservedClientId}
            initialSummary={row.reservedClientSummary}
            onChange={(id, summary) =>
              onChange({
                reservedClientId: id,
                reservedClientSummary: summary,
              })
            }
          />
        </div>
        <label className="block">
          <span className="mb-0.5 block text-xs text-gray-500">
            Період броні
          </span>
          <input
            type="date"
            value={row.reservedUntil}
            onChange={(e) => onChange({ reservedUntil: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-xs text-gray-500">Сектор</span>
          <select
            value={row.sectorId}
            onChange={(e) => onChange({ sectorId: e.target.value })}
            className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">— Немає —</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="__new__">+ Новий сектор…</option>
          </select>
          {row.sectorId === "__new__" && (
            <input
              value={row.sectorNew}
              onChange={(e) => onChange({ sectorNew: e.target.value })}
              placeholder="Назва нового сектора"
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
          )}
        </label>
      </div>

      <div className="mt-2">
        <input
          value={row.comment}
          onChange={(e) => onChange({ comment: e.target.value })}
          placeholder="Коментар"
          className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
        />
      </div>

      {row.lookupError && (
        <p className="mt-1 text-xs text-amber-600">{row.lookupError}</p>
      )}
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300"
      />
      <span className="text-gray-700">{label}</span>
    </label>
  );
}
