import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@ltex/db";
import { syncOrdersImportSchema } from "@/lib/validations";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.SYNC_API_KEY}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const limit = rateLimit(`sync-orders-import:${ip}`, {
    windowMs: 60_000,
    max: 10,
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = syncOrdersImportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }

  const orders = parsed.data;
  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const o of orders) {
    try {
      // Resolve products + lots up-front so we fail fast with a clear message
      // before mutating anything.
      const itemRefs: Array<{
        productId: string;
        lotId: string | null;
        priceEur: number;
        weight: number;
        quantity: number;
      }> = [];
      let itemError: string | null = null;
      for (const item of o.items) {
        const product = await prisma.product.findUnique({
          where: { code1C: item.productCode1C },
        });
        if (!product) {
          itemError = `Product not found: ${item.productCode1C} (order: ${o.code1C})`;
          break;
        }
        let lotId: string | null = null;
        if (item.barcode) {
          const lot = await prisma.lot.findUnique({
            where: { barcode: item.barcode },
          });
          if (!lot) {
            itemError = `Lot not found: ${item.barcode} (order: ${o.code1C})`;
            break;
          }
          if (lot.productId !== product.id) {
            itemError = `Lot ${item.barcode} does not belong to product ${item.productCode1C} (order: ${o.code1C})`;
            break;
          }
          lotId = lot.id;
        }
        itemRefs.push({
          productId: product.id,
          lotId,
          priceEur: item.priceEur,
          weight: item.weight,
          quantity: item.quantity,
        });
      }
      if (itemError) {
        errors.push(itemError);
        continue;
      }

      // Resolve customer: prefer code1C, fall back to phone, otherwise create.
      let customerId: string | null = null;
      if (o.customer.code1C) {
        const byCode = await prisma.customer.findUnique({
          where: { code1C: o.customer.code1C },
        });
        if (byCode) customerId = byCode.id;
      }
      if (!customerId && o.customer.phone) {
        const byPhone = await prisma.customer.findFirst({
          where: { phone: o.customer.phone },
        });
        if (byPhone) customerId = byPhone.id;
      }

      const customerData = {
        name: o.customer.name,
        phone: o.customer.phone ?? null,
        email: o.customer.email ?? null,
        telegram: o.customer.telegram ?? null,
        city: o.customer.city ?? null,
      };

      if (customerId) {
        await prisma.customer.update({
          where: { id: customerId },
          data: {
            ...customerData,
            ...(o.customer.code1C ? { code1C: o.customer.code1C } : {}),
          },
        });
      } else {
        const createdCustomer = await prisma.customer.create({
          data: {
            ...customerData,
            ...(o.customer.code1C ? { code1C: o.customer.code1C } : {}),
          },
        });
        customerId = createdCustomer.id;
      }

      const existing = await prisma.order.findUnique({
        where: { code1C: o.code1C },
      });

      const orderData = {
        customerId,
        status: o.status ?? "new",
        totalEur: o.totalEur ?? 0,
        totalUah: o.totalUah ?? 0,
        exchangeRate: o.exchangeRate ?? 0,
        notes: o.notes ?? null,
        ...(o.createdAt ? { createdAt: new Date(o.createdAt) } : {}),
      };

      await prisma.$transaction(async (tx) => {
        let orderId: string;
        if (existing) {
          await tx.order.update({
            where: { code1C: o.code1C },
            data: orderData,
          });
          orderId = existing.id;
          await tx.orderItem.deleteMany({ where: { orderId } });
        } else {
          const createdOrder = await tx.order.create({
            data: { ...orderData, code1C: o.code1C },
          });
          orderId = createdOrder.id;
        }

        if (itemRefs.length > 0) {
          await tx.orderItem.createMany({
            data: itemRefs.map((ref) => ({ ...ref, orderId })),
          });
        }
      });

      if (existing) updated++;
      else created++;

      await prisma.syncLog.create({
        data: {
          entity: "order_import",
          entityId: o.code1C,
          action: existing ? "update" : "create",
          payload: JSON.parse(JSON.stringify(o)),
        },
      });
    } catch (err) {
      errors.push(
        `Failed: ${o.code1C} — ${
          err instanceof Error ? err.message : "unknown"
        }`,
      );
    }
  }

  if (created > 0 || updated > 0) {
    revalidatePath("/admin/orders");
  }

  return NextResponse.json({
    created,
    updated,
    errors: errors.length,
    errorDetails: errors.slice(0, 10),
    total: orders.length,
  });
}
