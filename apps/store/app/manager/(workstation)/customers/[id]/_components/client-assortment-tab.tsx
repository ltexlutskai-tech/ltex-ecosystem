import { prisma } from "@ltex/db";

/**
 * Асортимент клієнта = реальний перелік товарів, які він купував, порахований
 * з історії реалізацій (SaleItem по code1C клієнта). Показує артикул, назву,
 * скільки разів купувалось, всього мішків, останню дату та середню ціну €/кг.
 * Дані вже в системі (перенесені з 1С), окремий імпорт не потрібен.
 */
export async function ClientAssortmentTab({ clientId }: { clientId: string }) {
  const client = await prisma.mgrClient.findUnique({
    where: { id: clientId },
    select: { code1C: true },
  });
  const code1C = client?.code1C ?? null;

  if (!code1C) {
    return (
      <div className="rounded-lg border bg-white p-5 text-sm text-gray-500 shadow-sm">
        Для цього клієнта ще немає історії асортименту (немає коду клієнта).
      </div>
    );
  }

  const items = await prisma.saleItem.findMany({
    where: { sale: { customer: { code1C } } },
    select: {
      productId: true,
      quantity: true,
      weight: true,
      priceEur: true,
      saleId: true,
      sale: { select: { createdAt: true } },
      product: { select: { name: true, articleCode: true } },
    },
  });

  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-5 text-sm text-gray-500 shadow-sm">
        Для цього клієнта ще немає історії асортименту.
      </div>
    );
  }

  interface Agg {
    productId: string;
    articleCode: string | null;
    productName: string | null;
    saleIds: Set<string>;
    bags: number;
    totalWeight: number;
    totalEur: number;
    lastAt: Date;
  }

  const byProduct = new Map<string, Agg>();
  for (const it of items) {
    let a = byProduct.get(it.productId);
    if (!a) {
      a = {
        productId: it.productId,
        articleCode: it.product?.articleCode ?? null,
        productName: it.product?.name ?? null,
        saleIds: new Set(),
        bags: 0,
        totalWeight: 0,
        totalEur: 0,
        lastAt: it.sale.createdAt,
      };
      byProduct.set(it.productId, a);
    }
    a.saleIds.add(it.saleId);
    a.bags += it.quantity;
    a.totalWeight += it.weight;
    a.totalEur += it.priceEur;
    if (it.sale.createdAt > a.lastAt) a.lastAt = it.sale.createdAt;
  }

  const rows = Array.from(byProduct.values()).sort(
    (x, y) => y.lastAt.getTime() - x.lastAt.getTime(),
  );

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-gray-800">
        Асортимент ({rows.length})
      </h3>
      <p className="text-sm text-gray-500">
        Товари, які купував клієнт (за історією реалізацій).
      </p>
      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs tracking-wide text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-2">Артикул</th>
              <th className="px-4 py-2">Назва товару</th>
              <th className="px-4 py-2 text-center">Разів</th>
              <th className="px-4 py-2 text-right">Мішків</th>
              <th className="px-4 py-2 text-right">Сер. ціна, €/кг</th>
              <th className="px-4 py-2">Остання покупка</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const avgPerKg =
                r.totalWeight > 0 ? r.totalEur / r.totalWeight : 0;
              return (
                <tr key={r.productId} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">
                    {r.articleCode ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-gray-800">
                    {r.productName ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-center text-gray-700">
                    {r.saleIds.size}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap text-gray-700">
                    {r.bags}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap text-gray-700">
                    {avgPerKg.toLocaleString("uk-UA", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    €
                  </td>
                  <td className="px-4 py-2 text-xs whitespace-nowrap text-gray-500">
                    {r.lastAt.toLocaleDateString("uk-UA")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
