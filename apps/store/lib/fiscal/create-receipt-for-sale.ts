import { prisma } from "@ltex/db";
import {
  buildReceiptNameResolver,
  resolveReceiptName,
  type CategoryNode,
} from "@/lib/manager/receipt-name";
import { getPaymentSummary } from "@/lib/manager/payment-summary";
import { createEttnReceipt } from "./checkbox";
import { buildEttnRequest, type EttnGoodInput } from "./ettn-payload";

/**
 * Фаза 3 — створення проєкту чека Checkbox (ETTN) для NovaPay-накладки.
 *
 * Викликається на «Готово» (склад підтвердив підготовку до відправки). Лише для
 * реалізацій з накладкою (`cashOnDelivery`) і наявним № ТТН. Ідемпотентно за
 * `CheckboxReceipt.saleId` (@unique): якщо чек уже створено — не повторюємо.
 * Best-effort: НЕ кидає; статус/помилку пишемо у `CheckboxReceipt`.
 */

function taxCode(): number | null {
  const raw = process.env.CHECKBOX_TAX_CODE;
  if (raw === undefined) return 8; // Без ПДВ (порт 1С: БезНДС → 8)
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function createCheckboxReceiptForSale(
  saleId: string,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: {
          include: {
            product: { select: { receiptName: true, categoryId: true } },
          },
        },
        checkboxReceipt: { select: { id: true, status: true } },
      },
    });
    if (!sale) return { ok: false, error: "Реалізацію не знайдено" };

    // Лише NovaPay-накладка з № ТТН.
    if (!sale.cashOnDelivery || !sale.expressWaybill) {
      return { ok: false, skipped: true };
    }
    // Сума чека = сума контролю оплати (накладки). Беремо ЗАЛИШОК до сплати з
    // того ж свіжого зведення по касі, що й ТТН — інакше Checkbox відхилить
    // («сума чека ≠ сума накладної»).
    const summary = await getPaymentSummary(saleId);
    const codUah = summary ? summary.codAmountUah : (sale.codAmountUah ?? 0);
    if (codUah <= 0) return { ok: false, skipped: true };

    // Ідемпотентність: чек уже створено.
    if (sale.checkboxReceipt?.status === "created") {
      return { ok: true, skipped: true };
    }

    // Групування позицій за загальною назвою (Одяг/Взуття/Товари для дому).
    const missingReceipt = sale.items.some(
      (it) => !it.product.receiptName?.trim(),
    );
    let resolver: ReturnType<typeof buildReceiptNameResolver>;
    if (missingReceipt) {
      const categories = await prisma.category.findMany({
        select: { id: true, name: true, parentId: true },
      });
      resolver = buildReceiptNameResolver(categories as CategoryNode[]);
    } else {
      resolver = buildReceiptNameResolver([]);
    }
    // Групуємо у 3 категорії, ВАГИ лотів однієї групи додаємо разом.
    const byName = new Map<string, EttnGoodInput>();
    for (const it of sale.items) {
      const { name, code } = resolveReceiptName(it.product, resolver);
      const existing = byName.get(name);
      const w = it.weight || 0;
      if (existing) {
        existing.weightKg += w;
      } else {
        byName.set(name, { name, code, weightKg: w });
      }
    }
    const goods = [...byName.values()];

    const request = buildEttnRequest({
      goods,
      codUah,
      ettn: sale.expressWaybill,
      taxCode: taxCode(),
    });

    const result = await createEttnReceipt(request);
    if (!result.ok) {
      await upsertReceipt(saleId, {
        status: "failed",
        ettn: sale.expressWaybill,
        error: result.error,
        payloadSnapshot: request,
      });
      return { ok: false, error: result.error };
    }

    await upsertReceipt(saleId, {
      status: "created",
      ettn: sale.expressWaybill,
      receiptId: result.receipt.id ?? null,
      fiscalCode: result.receipt.fiscalCode ?? null,
      error: null,
      payloadSnapshot: request,
    });
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Помилка чека Checkbox";
    await upsertReceipt(saleId, { status: "failed", error: message }).catch(
      () => undefined,
    );
    return { ok: false, error: message };
  }
}

async function upsertReceipt(
  saleId: string,
  data: {
    status: string;
    ettn?: string | null;
    receiptId?: string | null;
    fiscalCode?: string | null;
    error?: string | null;
    payloadSnapshot?: unknown;
  },
): Promise<void> {
  const snapshot =
    data.payloadSnapshot === undefined
      ? undefined
      : JSON.parse(JSON.stringify(data.payloadSnapshot));
  await prisma.checkboxReceipt.upsert({
    where: { saleId },
    create: {
      saleId,
      status: data.status,
      ettn: data.ettn ?? null,
      receiptId: data.receiptId ?? null,
      fiscalCode: data.fiscalCode ?? null,
      error: data.error ?? null,
      payloadSnapshot: snapshot ?? undefined,
    },
    update: {
      status: data.status,
      ...(data.ettn !== undefined ? { ettn: data.ettn } : {}),
      ...(data.receiptId !== undefined ? { receiptId: data.receiptId } : {}),
      ...(data.fiscalCode !== undefined ? { fiscalCode: data.fiscalCode } : {}),
      error: data.error ?? null,
      ...(snapshot !== undefined ? { payloadSnapshot: snapshot } : {}),
    },
  });
}
