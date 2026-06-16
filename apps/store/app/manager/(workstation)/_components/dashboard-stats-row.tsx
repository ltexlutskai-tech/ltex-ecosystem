export function DashboardStatsRow({
  clientCount,
  totalDebt,
}: {
  clientCount: number;
  totalDebt: number;
}) {
  if (clientCount === 0) {
    return (
      <div className="rounded-lg border bg-white p-4 text-sm text-gray-500 shadow-sm">
        У вас поки немає закріплених клієнтів.
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-white p-4 text-sm text-gray-700 shadow-sm">
      <span>
        Мої клієнти: <span className="font-semibold">{clientCount}</span>
      </span>
      <span className="text-gray-300">·</span>
      <span>
        Загальний борг:{" "}
        <span className="font-semibold">{formatEur(totalDebt)}</span>
      </span>
    </div>
  );
}

function formatEur(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} €`;
}
