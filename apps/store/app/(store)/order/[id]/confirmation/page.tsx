import { prisma } from "@ltex/db";
import { notFound } from "next/navigation";
import { Badge, Button } from "@ltex/ui";
import {
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from "@ltex/shared";
import Link from "next/link";
import { CONTACTS } from "@ltex/shared";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OrderConfirmationPage({ params }: Props) {
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: true,
      items: {
        include: {
          product: { select: { name: true, slug: true } },
          lot: { select: { barcode: true, weight: true } },
        },
      },
    },
  });

  if (!order) notFound();

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mx-auto max-w-2xl text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-600">
          &#10003;
        </div>
        <h1 className="mt-4 text-2xl font-bold text-green-700">
          {dict.order.confirmed}
        </h1>
        <p className="mt-2 text-gray-500">
          {dict.order.confirmMessage}
        </p>
      </div>

      <div className="mx-auto mt-8 max-w-2xl rounded-lg border bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">{dict.order.details}</h2>
          <Badge variant="outline">
            {ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status}
          </Badge>
        </div>

        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <span className="text-gray-500">{dict.order.orderId}:</span>
            <p className="font-mono text-xs">{order.id.slice(0, 8)}</p>
          </div>
          <div>
            <span className="text-gray-500">{dict.order.date}:</span>
            <p>{new Date(order.createdAt).toLocaleDateString("uk-UA")}</p>
          </div>
          <div>
            <span className="text-gray-500">{dict.order.client}:</span>
            <p>{order.customer.name}</p>
          </div>
          <div>
            <span className="text-gray-500">{dict.order.phoneLabel}:</span>
            <p>{order.customer.phone}</p>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="pb-2 font-medium">{dict.cart.product}</th>
                <th className="pb-2 font-medium">{dict.cart.barcode}</th>
                <th className="pb-2 font-medium">{dict.cart.weight}</th>
                <th className="pb-2 text-right font-medium">{dict.cart.priceEur}</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="py-2">{item.product.name}</td>
                  <td className="py-2 font-mono text-xs">
                    {item.lot.barcode}
                  </td>
                  <td className="py-2">{item.weight} кг</td>
                  <td className="py-2 text-right">€{item.priceEur.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-between border-t pt-4">
          <div className="text-sm text-gray-500">
            {order.items.length} {dict.order.items},{" "}
            {order.items.reduce((s, i) => s + i.weight, 0).toFixed(1)} кг
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-green-700">
              €{order.totalEur.toFixed(2)}
            </p>
            {order.totalUah > 0 && (
              <p className="text-sm text-gray-500">
                ≈ ₴{order.totalUah.toFixed(2)}
              </p>
            )}
          </div>
        </div>

        {order.notes && (
          <div className="mt-4 rounded-md bg-gray-50 p-3 text-sm">
            <span className="font-medium">{dict.order.commentLabel}:</span> {order.notes}
          </div>
        )}
      </div>

      <div className="mx-auto mt-8 flex max-w-2xl justify-center gap-4">
        <Button asChild>
          <Link href="/catalog">{dict.order.continueShopping}</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/order/${order.id}/status`}>{dict.order.trackStatus}</Link>
        </Button>
        <Button variant="outline" asChild>
          <a
            href={`https://t.me/${CONTACTS.telegram.replace("@", "")}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Telegram
          </a>
        </Button>
      </div>
    </div>
  );
}
