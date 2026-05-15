import Link from "next/link";
import { prisma } from "@ltex/db";
import { EmptyState } from "../../../_components/empty-state";
import { ClientOrdersList } from "./client-orders-list";
import { OrderCreateButton } from "./order-create-button";

export async function ClientOrdersTab({ clientId }: { clientId: string }) {
  const client = await prisma.mgrClient.findUnique({
    where: { id: clientId },
    select: { code1C: true },
  });

  const code1C = client?.code1C ?? null;
  const TAKE = 10;

  if (!code1C) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">Замовлення</h3>
          <OrderCreateButton />
        </div>
        <EmptyState
          message="Клієнт ще не синхронізований з 1С"
          hint="Замовлення з 1С прив'язуються за кодом клієнта (code1C). Зачекайте на найближчий sync або зверніться до адміністратора."
        />
      </div>
    );
  }

  const where = { customer: { code1C } };
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: TAKE,
      include: { _count: { select: { items: true } } },
    }),
    prisma.order.count({ where }),
  ]);

  const rows = orders.map((o) => ({
    id: o.id,
    code1C: o.code1C,
    status: o.status,
    totalEur: o.totalEur,
    totalUah: o.totalUah,
    itemCount: o._count.items,
    createdAt: o.createdAt,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">
          Замовлення ({total})
        </h3>
        <OrderCreateButton />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          message="Поки що немає замовлень"
          hint="Як тільки клієнт зробить перше замовлення — воно з'явиться тут."
        />
      ) : (
        <>
          <ClientOrdersList orders={rows} />
          {total > TAKE && (
            <Link
              href={`/manager/orders?clientCode1C=${encodeURIComponent(code1C)}`}
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
