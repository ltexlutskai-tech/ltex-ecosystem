export function BagStateStatusBadge({ status }: { status: string }) {
  const meta: Record<string, { label: string; color: string }> = {
    draft: { label: "Чернетка", color: "bg-gray-100 text-gray-700" },
    posted: { label: "Проведено", color: "bg-emerald-100 text-emerald-800" },
    cancelled: { label: "Скасовано", color: "bg-red-100 text-red-700" },
  };
  const m = meta[status] ?? {
    label: status,
    color: "bg-gray-100 text-gray-700",
  };
  return (
    <span className={`rounded-sm px-1.5 py-0.5 text-xs font-medium ${m.color}`}>
      {m.label}
    </span>
  );
}
