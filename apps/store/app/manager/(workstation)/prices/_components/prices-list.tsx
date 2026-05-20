import Link from "next/link";
import type { PriceRow } from "@/lib/manager/prices";

interface Props {
  items: PriceRow[];
}

function formatPrice(value: number | null, currency: string): string {
  if (value === null) return "—";
  const symbol = currency === "EUR" ? "€" : currency;
  return `${value.toFixed(2)} ${symbol}`;
}

function formatRemaining(row: PriceRow): string {
  if (row.priceUnit === "piece") {
    return `${row.freeLotsCount} лот.`;
  }
  return `${row.remainingKg.toLocaleString("uk-UA")} кг`;
}

/** Підсвічування рядка: цільові/з відео — зелено; нові — янтарно. */
function rowHighlight(row: PriceRow): string {
  if (row.isTarget || row.hasVideo)
    return "bg-emerald-50/60 hover:bg-emerald-100/60";
  if (row.isNew) return "bg-amber-50/60 hover:bg-amber-100/60";
  return "hover:bg-gray-50";
}

export function PricesList({ items }: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-white p-12 text-center text-sm text-gray-500">
        Товарів не знайдено за вибраними фільтрами.
      </div>
    );
  }

  return (
    <>
      {/* Desktop — таблиця */}
      <div className="hidden overflow-x-auto rounded-lg border bg-white shadow-sm md:block">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2">Товар</th>
              <th className="px-4 py-2 whitespace-nowrap">Залишок</th>
              <th className="px-4 py-2 whitespace-nowrap">Ціна</th>
              <th className="px-4 py-2 whitespace-nowrap">Акція</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((row) => (
              <tr key={row.id} className={rowHighlight(row)}>
                <td className="px-4 py-2 align-top">
                  <Link
                    href={`/manager/prices/${row.id}`}
                    className="font-medium text-gray-900 hover:underline"
                  >
                    {row.name}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-gray-500">
                    {row.articleCode && <span>Арт. {row.articleCode}</span>}
                    {row.categoryName && <span>· {row.categoryName}</span>}
                    {row.isTarget && (
                      <Badge className="bg-emerald-600">Ціль</Badge>
                    )}
                    {row.isNew && <Badge className="bg-amber-500">Нове</Badge>}
                    {row.hasVideo && (
                      <Badge className="bg-sky-600">Відео</Badge>
                    )}
                  </div>
                  {row.description && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-gray-400">
                      {row.description}
                    </p>
                  )}
                </td>
                <td className="px-4 py-2 align-top whitespace-nowrap text-gray-800">
                  {formatRemaining(row)}
                </td>
                <td className="px-4 py-2 align-top whitespace-nowrap text-gray-800">
                  {formatPrice(row.basePrice, row.currency)}
                </td>
                <td className="px-4 py-2 align-top whitespace-nowrap font-semibold text-emerald-600">
                  {formatPrice(row.salePrice, row.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile — картки */}
      <div className="space-y-2 md:hidden">
        {items.map((row) => (
          <Link
            key={row.id}
            href={`/manager/prices/${row.id}`}
            className={`block rounded-lg border bg-white p-3 shadow-sm ${rowHighlight(
              row,
            )}`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-gray-900">{row.name}</span>
              <div className="flex shrink-0 gap-1">
                {row.isTarget && <Badge className="bg-emerald-600">Ціль</Badge>}
                {row.isNew && <Badge className="bg-amber-500">Нове</Badge>}
                {row.hasVideo && <Badge className="bg-sky-600">Відео</Badge>}
              </div>
            </div>
            <div className="mt-1 flex flex-wrap gap-1 text-xs text-gray-500">
              {row.articleCode && <span>Арт. {row.articleCode}</span>}
              {row.categoryName && <span>· {row.categoryName}</span>}
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-gray-600">{formatRemaining(row)}</span>
              <span className="flex items-center gap-2">
                <span className="text-gray-800">
                  {formatPrice(row.basePrice, row.currency)}
                </span>
                {row.salePrice !== null && (
                  <span className="font-semibold text-emerald-600">
                    {formatPrice(row.salePrice, row.currency)}
                  </span>
                )}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white ${
        className ?? "bg-gray-500"
      }`}
    >
      {children}
    </span>
  );
}
