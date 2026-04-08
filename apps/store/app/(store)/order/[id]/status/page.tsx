import { prisma } from "@ltex/db";
import { notFound } from "next/navigation";
import { Badge, Button } from "@ltex/ui";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  type OrderStatus,
} from "@ltex/shared";
import Link from "next/link";
import { CheckCircle, Circle, Clock } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export const revalidate = 30;

const statusProgress: OrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
];

export default async function OrderStatusPage({ params }: Props) {
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true, phone: true } },
      items: {
        include: {
          product: { select: { name: true } },
        },
      },
      shipments: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!order) notFound();

  const currentStatus = order.status as OrderStatus;
  const isCancelled = currentStatus === "cancelled";
  const currentIndex = statusProgress.indexOf(currentStatus);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold">Стан замовлення</h1>
        <p className="mt-1 text-sm text-gray-500">
          Замовлення: {order.code1C ?? order.id.slice(0, 8)}
        </p>

        {/* Status timeline */}
        <div className="mt-8">
          {isCancelled ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
              <Badge variant="destructive" className="text-sm">
                {ORDER_STATUS_LABELS.cancelled}
              </Badge>
              <p className="mt-2 text-sm text-red-700">
                Це замовлення було скасовано
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {statusProgress.map((status, index) => {
                const isPast = index <= currentIndex;
                const isCurrent = index === currentIndex;
                return (
                  <div key={status} className="flex items-center gap-4">
                    <div className="flex flex-col items-center">
                      {isPast ? (
                        <CheckCircle
                          className={`h-6 w-6 ${isCurrent ? "text-green-600" : "text-green-400"}`}
                        />
                      ) : (
                        <Circle className="h-6 w-6 text-gray-300" />
                      )}
                      {index < statusProgress.length - 1 && (
                        <div
                          className={`mt-1 h-8 w-0.5 ${isPast ? "bg-green-400" : "bg-gray-200"}`}
                        />
                      )}
                    </div>
                    <div>
                      <p
                        className={`font-medium ${isPast ? "text-green-700" : "text-gray-400"}`}
                      >
                        {ORDER_STATUS_LABELS[status]}
                      </p>
                      {isCurrent && (
                        <p className="text-xs text-gray-500">
                          <Clock className="mr-1 inline h-3 w-3" />
                          Поточний статус
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Shipment info */}
        {order.shipments.length > 0 && (
          <div className="mt-8 rounded-lg border p-4">
            <h2 className="font-bold">Доставка</h2>
            {order.shipments.map((s) => (
              <div key={s.id} className="mt-2 text-sm">
                <p>
                  Трекінг:{" "}
                  <span className="font-mono">{s.trackingNumber}</span>
                </p>
                {s.statusText && <p>Статус: {s.statusText}</p>}
                {s.estimatedDate && (
                  <p>
                    Очікувана дата:{" "}
                    {new Date(s.estimatedDate).toLocaleDateString("uk-UA")}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Order summary */}
        <div className="mt-8 rounded-lg border p-4">
          <h2 className="font-bold">Деталі</h2>
          <div className="mt-3 space-y-1 text-sm">
            <p>
              <span className="text-gray-500">Клієнт:</span>{" "}
              {order.customer.name}
            </p>
            <p>
              <span className="text-gray-500">Позицій:</span>{" "}
              {order.items.length}
            </p>
            <p>
              <span className="text-gray-500">Вага:</span>{" "}
              {order.items.reduce((s, i) => s + i.weight, 0).toFixed(1)} кг
            </p>
            <p>
              <span className="text-gray-500">Сума:</span> €
              {order.totalEur.toFixed(2)}
              {order.totalUah > 0 && (
                <span className="text-gray-400">
                  {" "}
                  (≈ ₴{order.totalUah.toFixed(2)})
                </span>
              )}
            </p>
            <p>
              <span className="text-gray-500">Дата:</span>{" "}
              {new Date(order.createdAt).toLocaleDateString("uk-UA")}
            </p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Button variant="outline" asChild>
            <Link href="/catalog">Повернутися до каталогу</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
