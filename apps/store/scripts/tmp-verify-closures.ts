import { prisma } from "@ltex/db";
import { formatOrderNumber } from "@/lib/manager/order-number";

async function main() {
  const mgr = await prisma.mgrClient.findFirstOrThrow({
    where: { code1C: "000002030" },
  });
  const product = await prisma.product.findFirstOrThrow({});
  const customer =
    (await prisma.customer.findFirst({ where: { code1C: mgr.code1C } })) ??
    (await prisma.customer.create({
      data: { name: mgr.name, code1C: mgr.code1C },
    }));

  // Active order with an item (mirror createOrderWithItems shape).
  await prisma.order.deleteMany({ where: { customerId: customer.id } });
  const order = await prisma.order.create({
    data: {
      customerId: customer.id,
      number1C: "L0000009999",
      status: "posted",
      isActual: true,
      archived: false,
      totalEur: 78,
      totalUah: 4040,
      exchangeRate: 51.8,
      items: {
        create: [
          {
            productId: product.id,
            weight: 20,
            quantity: 1,
            priceEur: 78,
            unitPriceEur: 3.9,
          },
        ],
      },
    },
    include: { items: true },
  });

  // Closures GET query shape.
  const orders = await prisma.order.findMany({
    where: {
      customer: { code1C: mgr.code1C },
      closedAt: null,
      archived: false,
    },
    include: {
      items: {
        include: {
          product: {
            select: { id: true, name: true, code1C: true, articleCode: true },
          },
        },
      },
    },
  });
  console.log(
    "closures orders:",
    orders.length,
    "| №:",
    formatOrderNumber(orders[0]!),
    "| item:",
    orders[0]!.items[0]!.product.name,
    "w=",
    Number(orders[0]!.items[0]!.weight),
    "unit=",
    orders[0]!.items[0]!.unitPriceEur,
  );

  // Carry rebuild query shape.
  const pid = order.items[0]!.productId;
  const carried = await prisma.order.findMany({
    where: { id: { in: [order.id] } },
    select: {
      id: true,
      customerId: true,
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              prices: {
                where: { priceType: { in: ["wholesale", "akciya"] } },
                select: { priceType: true, amount: true, currency: true },
              },
            },
          },
        },
      },
    },
  });
  const carryItem = carried[0]!.items.find((i) => i.productId === pid)!;
  console.log(
    "carry: customerId=",
    carried[0]!.customerId,
    "| product=",
    carryItem.product.name,
    "| prices=",
    carryItem.product.prices.length,
  );
  if (carried[0]!.customerId !== customer.id)
    throw new Error("carry customer mismatch");
  console.log("OK — closures + carry queries працюють проти реальної БД");
}
main().then(() => process.exit(0));
