/**
 * Бейдж виду руху коштів касового ордера (1С ВидДвиженияДенежныхСредств):
 *  • income  → «Приход» (зелений);
 *  • expense → «Расход» (бурштиновий).
 */
export function CashOrderTypeBadge({ type }: { type: string }) {
  const isIncome = type === "income";
  const cls = isIncome
    ? "bg-green-50 text-green-700 ring-green-200"
    : "bg-amber-50 text-amber-700 ring-amber-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {isIncome ? "Приход" : "Расход"}
    </span>
  );
}
