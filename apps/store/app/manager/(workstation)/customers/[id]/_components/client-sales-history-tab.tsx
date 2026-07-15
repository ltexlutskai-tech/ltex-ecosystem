import Link from "next/link";
import { prisma } from "@ltex/db";
import { EmptyState } from "../../../_components/empty-state";
import {
  ClientSalesHistoryList,
  type ClientSaleRowData,
} from "./client-sales-history-list";

export async function ClientSalesHistoryTab({
  clientId,
}: {
  clientId: string;
}) {
  const client = await prisma.mgrClient.findUnique({
    where: { id: clientId },
    select: { code1C: true },
  });

  const code1C = client?.code1C ?? null;
  const TAKE = 10;

  if (!code1C) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-800">Історія продаж</h3>
        <EmptyState
          message="У клієнта ще немає продажів"
          hint="Реалізації прив'язуються за кодом клієнта (code1C). У цього клієнта код ще не проставлено."
        />
      </div>
    );
  }

  const where = { customer: { code1C } };
  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: TAKE,
      include: {
        _count: { select: { items: true } },
        items: {
          include: {
            product: { select: { name: true, articleCode: true } },
          },
        },
      },
    }),
    prisma.sale.count({ where }),
  ]);

  const rows: ClientSaleRowData[] = sales.map((s) => ({
    id: s.id,
    code1C: s.code1C,
    number1C: s.number1C,
    docNumber: s.docNumber,
    status: s.status,
    totalEur: s.totalEur,
    totalUah: s.totalUah,
    itemCount: s._count.items,
    createdAt: s.createdAt,
    items: s.items.map((it) => ({
      id: it.id,
      articleCode: it.product?.articleCode ?? null,
      productName: it.product?.name ?? null,
      quantity: it.quantity,
      weight: it.weight,
      pricePerKg: it.pricePerKg,
      priceEur: it.priceEur,
      exchangeRateEur: s.exchangeRateEur,
    })),
  }));

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800">
        Історія продаж ({total})
      </h3>

      {rows.length === 0 ? (
        <EmptyState
          message="Поки що немає реалізацій"
          hint="Як тільки буде оформлено першу реалізацію — вона з'явиться тут."
        />
      ) : (
        <>
          <ClientSalesHistoryList sales={rows} />
          {total > TAKE && (
            <Link
              href={`/manager/sales?clientCode1C=${encodeURIComponent(code1C)}`}
              className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700"
            >
              Показати всі ({total}) →
            </Link>
          )}
        </>
      )}
    </div>
  );
}
