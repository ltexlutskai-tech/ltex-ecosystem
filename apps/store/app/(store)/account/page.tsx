import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { Card, CardContent } from "@ltex/ui";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { getDictionary } from "@/lib/i18n";
import { ProfileForm } from "./profile-form";

const dict = getDictionary();

export const metadata: Metadata = {
  title: `${dict.auth.account} — L-TEX`,
  robots: { index: false, follow: false },
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: "Чернетка",
  new: "Новий",
  confirmed: "Підтверджено",
  packed: "Упаковано",
  shipped: "Відправлено",
  delivered: "Доставлено",
  cancelled: "Скасовано",
};

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("uk-UA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default async function AccountPage() {
  const session = await getCurrentCustomer();
  if (!session) redirect("/login?returnTo=/account");

  const customer = await prisma.customer.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      telegram: true,
      city: true,
      notes: true,
    },
  });
  if (!customer) redirect("/login");

  const [orders, favoriteCount] = await Promise.all([
    prisma.order.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        items: {
          select: {
            id: true,
            quantity: true,
            weight: true,
            priceEur: true,
            product: { select: { name: true, slug: true } },
            lot: { select: { barcode: true } },
          },
        },
      },
    }),
    prisma.favorite.count({ where: { customerId: customer.id } }),
  ]);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6">
        <p className="text-sm text-muted-foreground">{dict.auth.welcomeBack}</p>
        <h1 className="text-3xl font-bold">
          {customer.name || dict.auth.account}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{customer.phone}</p>
      </header>

      <section className="mt-8">
        <h2 className="mb-3 text-xl font-bold">{dict.auth.profileTitle}</h2>
        <Card>
          <CardContent className="p-5">
            <ProfileForm
              customer={{
                id: customer.id,
                name: customer.name,
                phone: customer.phone ?? "",
                email: customer.email,
                telegram: customer.telegram,
                city: customer.city,
                notes: customer.notes,
              }}
            />
          </CardContent>
        </Card>
      </section>

      <section className="mt-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-xl font-bold">{dict.auth.ordersTitle}</h2>
          <span className="text-sm text-muted-foreground">{orders.length}</span>
        </div>
        {orders.length === 0 ? (
          <p className="rounded-lg border bg-muted/30 p-6 text-sm text-muted-foreground">
            {dict.auth.ordersEmpty}{" "}
            <Link
              href="/catalog"
              className="font-medium text-primary underline"
            >
              {dict.nav.catalog}
            </Link>
          </p>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => {
              const itemsCount = order.items.length;
              const status = ORDER_STATUS_LABELS[order.status] ?? order.status;
              return (
                <Card key={order.id}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          Замовлення #{order.code1C ?? order.id.slice(0, 8)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(order.createdAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {order.totalUah > 0
                            ? `${order.totalUah.toFixed(0)} ₴`
                            : `€${order.totalEur.toFixed(2)}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {status}
                        </p>
                      </div>
                    </div>
                    <details className="mt-3 group">
                      <summary className="cursor-pointer text-sm text-primary">
                        Позицій: {itemsCount}
                      </summary>
                      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                        {order.items.map((it) => (
                          <li
                            key={it.id}
                            className="flex justify-between gap-4"
                          >
                            <span className="truncate">
                              {it.product.name}
                              {it.lot?.barcode && (
                                <span className="ml-2 font-mono text-xs">
                                  {it.lot.barcode}
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 text-foreground">
                              {it.weight} кг · €{it.priceEur.toFixed(2)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                    <div className="mt-3">
                      <Link
                        href={`/order/${order.id}/status`}
                        className="text-sm text-primary underline"
                      >
                        {dict.auth.orderSeeDetails}
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">
                {dict.auth.wishlistTitle}
              </p>
              <p className="mt-0.5 text-2xl font-bold">{favoriteCount}</p>
            </div>
            <Link
              href="/wishlist"
              className="text-sm font-medium text-primary underline"
            >
              {dict.auth.wishlistGoTo}
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">
                {dict.auth.cartTitle}
              </p>
              <p className="mt-0.5 text-sm">Перейти у кошик для оформлення</p>
            </div>
            <Link
              href="/cart"
              className="text-sm font-medium text-primary underline"
            >
              {dict.auth.cartGoTo}
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
