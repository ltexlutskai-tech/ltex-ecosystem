import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { canViewOrder } from "@/lib/manager/order-ownership";
import { UnderConstruction } from "../../_components/under-construction";
import { OrderStatusBadge } from "../../customers/[id]/_components/order-status-badge";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    select: { code1C: true },
  });
  return {
    title: order?.code1C
      ? `Замовлення №${order.code1C} — L-TEX Manager`
      : "Замовлення — L-TEX Manager",
  };
}

export default async function ManagerOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const { id } = await params;
  const ok = await canViewOrder(user, id);
  if (!ok) notFound();

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: {
        select: { id: true, name: true, code1C: true, phone: true, city: true },
      },
      items: {
        include: {
          product: { select: { id: true, name: true, slug: true } },
          lot: { select: { id: true, barcode: true } },
        },
      },
      shipments: true,
      payments: true,
    },
  });
  if (!order) notFound();

  const date = new Date(order.createdAt).toLocaleString("uk-UA");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/manager/orders"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Назад до списку
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Замовлення №{order.code1C ?? order.id.slice(0, 8)}
          </h1>
          <p className="mt-1 text-sm text-gray-500">Створено: {date}</p>
        </div>
        <OrderStatusBadge status={order.status} />
      </header>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-base font-semibold text-gray-800">Клієнт</h2>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Field label="Назва">
            <Link
              href={`/manager/customers/${order.customer.id}`}
              className="text-blue-600 hover:text-blue-700"
            >
              {order.customer.name}
            </Link>
          </Field>
          <Field label="Код 1С">
            <span className="font-mono">{order.customer.code1C ?? "—"}</span>
          </Field>
          <Field label="Телефон">{order.customer.phone ?? "—"}</Field>
          <Field label="Місто">{order.customer.city ?? "—"}</Field>
        </dl>
      </section>

      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-base font-semibold text-gray-800">
          Позиції ({order.items.length})
        </h2>
        {order.items.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            У замовленні немає позицій.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">Товар</th>
                  <th className="px-3 py-2 font-medium">Лот</th>
                  <th className="px-3 py-2 text-right font-medium">Вага, кг</th>
                  <th className="px-3 py-2 text-right font-medium">К-сть</th>
                  <th className="px-3 py-2 text-right font-medium">Ціна, €</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((it) => (
                  <tr key={it.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2 text-gray-800">
                      {it.product.name}
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-600">
                      {it.lot?.barcode ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {it.weight.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {it.quantity}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">
                      {it.priceEur.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-4 border-t pt-3 text-sm">
          <span className="text-gray-500">
            Сума:{" "}
            <span className="font-semibold text-gray-800">
              {order.totalEur.toFixed(2)} €
            </span>{" "}
            ·{" "}
            <span className="font-semibold text-gray-800">
              {Math.round(order.totalUah).toLocaleString("uk-UA")} ₴
            </span>
          </span>
        </div>
      </section>

      {order.notes && (
        <section className="rounded-lg border bg-white p-5">
          <h2 className="text-base font-semibold text-gray-800">Примітки</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-gray-700">
            {order.notes}
          </p>
        </section>
      )}

      <UnderConstruction
        session="M1.5"
        description="Редагування замовлення + SOAP write-back у 1С будуть у M1.5."
      />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-gray-800">{children}</dd>
    </div>
  );
}
