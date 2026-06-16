import { formatEur, parseDecimal } from "./format";

export function DebtCell({ value }: { value: string | null | undefined }) {
  const n = parseDecimal(value);
  if (n === 0) {
    return <span className="text-gray-500">0,00 €</span>;
  }
  if (n < 0) {
    return (
      <div className="flex flex-col">
        <span className="font-medium text-green-700">{formatEur(n)}</span>
        <span className="text-xs text-green-600">переплата</span>
      </div>
    );
  }
  return <span className="font-medium text-red-700">{formatEur(n)}</span>;
}
