import { prisma } from "@ltex/db";
import {
  ClientAssortmentTable,
  type AssortmentRow,
} from "./client-assortment-table";

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

  const rows: AssortmentRow[] = Array.from(byProduct.values())
    .sort((x, y) => y.lastAt.getTime() - x.lastAt.getTime())
    .map((r) => ({
      productId: r.productId,
      articleCode: r.articleCode,
      productName: r.productName,
      times: r.saleIds.size,
      bags: r.bags,
      avgPerKg: r.totalWeight > 0 ? r.totalEur / r.totalWeight : 0,
      lastAtIso: r.lastAt.toISOString(),
    }));

  return <ClientAssortmentTable rows={rows} />;
}
