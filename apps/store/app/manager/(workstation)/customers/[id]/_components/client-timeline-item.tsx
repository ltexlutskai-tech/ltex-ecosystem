import { formatRelativeShort } from "../../../_components/format-relative";
import type { ClientTimelineEntry } from "./types";

const KIND_META: Record<
  string,
  { icon: string; label: string; color: string }
> = {
  payment: { icon: "💵", label: "Оплата", color: "text-green-700" },
  sale: { icon: "🛒", label: "Реалізація", color: "text-blue-700" },
  reminder: { icon: "⏰", label: "Нагадування", color: "text-amber-700" },
  comment: { icon: "💬", label: "Коментар", color: "text-gray-700" },
  viber: { icon: "📱", label: "Viber", color: "text-purple-700" },
  sync: { icon: "🔄", label: "Синхронізація", color: "text-gray-500" },
};

export function ClientTimelineItem({ entry }: { entry: ClientTimelineEntry }) {
  const meta = KIND_META[entry.kind] ?? {
    icon: "•",
    label: entry.kind,
    color: "text-gray-700",
  };
  return (
    <li className="flex gap-3 py-3">
      <span className="mt-0.5 text-xl" aria-hidden title={meta.label}>
        {meta.icon}
      </span>
      <div className="flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className={`text-xs font-medium uppercase ${meta.color}`}>
            {meta.label}
          </span>
          <span className="text-xs text-gray-500">
            {formatRelativeShort(entry.occurredAt)}
          </span>
          {entry.author && (
            <span className="text-xs text-gray-500">
              · {entry.author.fullName}
            </span>
          )}
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">
          {entry.body}
        </p>
      </div>
    </li>
  );
}
