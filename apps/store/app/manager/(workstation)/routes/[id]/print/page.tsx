import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import { prisma } from "@ltex/db";
import { formatDocNumber, formatOrderNumber } from "@/lib/manager/order-number";

export const dynamic = "force-dynamic";
export const metadata = { title: "Маршрутний лист — друк | L-TEX" };

/**
 * Друк-сторінка маршрутного листа — A4-бланк дня виїзду.
 *
 * Шапка: № / дата / експедитор / маршрут (route.name або comment) / кілометраж.
 * Таблиця замовлень-зупинок (клієнт / місто / № замовлення) + таблиця товарів
 * (клієнт / товар / к-сть / сума). Місце для підписів «Здав / Прийняв».
 *
 * @media print стилі прибирають UI-кнопки і виставляють A4-orientation
 * (дзеркало sales/[id]/print).
 */
export default async function PrintRouteSheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole([
    "manager",
    "senior_manager",
    "supervisor",
    "admin",
    "owner",
    "analyst",
    "bookkeeper",
    "expeditor",
    "warehouse",
  ]);
  if (!user) notFound();
  const { id } = await params;

  const sheet = await prisma.routeSheet.findUnique({
    where: { id },
    include: {
      route: { select: { name: true } },
      expeditor: { select: { fullName: true } },
      orders: true,
      items: true,
      expenses: { include: { cashFlowArticle: { select: { name: true } } } },
    },
  });
  if (!sheet) notFound();

  // ─── Batch-resolve cross-model names (плоскі скаляри, без relation) ────────
  const orderIds = new Set<string>();
  const customerIds = new Set<string>();
  const productIds = new Set<string>();
  for (const o of sheet.orders) {
    orderIds.add(o.orderId);
    if (o.customerId) customerIds.add(o.customerId);
  }
  for (const it of sheet.items) {
    if (it.orderId) orderIds.add(it.orderId);
    if (it.customerId) customerIds.add(it.customerId);
    productIds.add(it.productId);
  }

  const [orders, customers, products] = await Promise.all([
    orderIds.size > 0
      ? prisma.order.findMany({
          where: { id: { in: [...orderIds] } },
          select: { id: true, code1C: true, number1C: true },
        })
      : Promise.resolve([]),
    customerIds.size > 0
      ? prisma.customer.findMany({
          where: { id: { in: [...customerIds] } },
          select: { id: true, name: true, city: true },
        })
      : Promise.resolve([]),
    productIds.size > 0
      ? prisma.product.findMany({
          where: { id: { in: [...productIds] } },
          select: { id: true, name: true, articleCode: true },
        })
      : Promise.resolve([]),
  ]);

  const orderMap = new Map(orders.map((o) => [o.id, o]));
  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const productMap = new Map(products.map((p) => [p.id, p]));

  const displayNumber = formatDocNumber(sheet);
  const routeLabel = sheet.route?.name || sheet.comment || "—";
  const mileageTotal =
    sheet.mileageStartKm != null && sheet.mileageEndKm != null
      ? sheet.mileageEndKm - sheet.mileageStartKm
      : null;

  const totalItemsSum = sheet.items.reduce((s, i) => s + i.sum, 0);
  const expensesTotal = sheet.expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="print-page">
      <style>{`
        body { margin: 0; background: #f3f4f6; }
        .print-page { padding: 20px; max-width: 21cm; margin: 0 auto; }
        .toolbar {
          padding: 12px 16px; background: #fff;
          border-bottom: 1px solid #e5e7eb;
          display: flex; gap: 12px; align-items: center;
          margin-bottom: 20px;
          border-radius: 6px;
        }
        .sheet {
          background: #fff; padding: 20mm; min-height: 27cm;
          font-family: -apple-system, system-ui, sans-serif;
          font-size: 10pt; color: #000;
          border-radius: 4px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .sheet h1 { font-size: 14pt; margin: 0 0 14px; }
        .sheet h2 { font-size: 11pt; margin: 20px 0 6px; }
        .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 8px; font-size: 10pt; }
        .meta div span { color: #555; }
        table { width: 100%; border-collapse: collapse; }
        table th, table td {
          border: 1px solid #888;
          padding: 4px 6px;
          font-size: 10pt;
          vertical-align: top;
        }
        table th { background: #f3f4f6; font-weight: 600; text-align: left; }
        table td.num, table th.num { text-align: right; white-space: nowrap; }
        .total-row td { font-weight: 700; background: #fafafa; }
        .signatures {
          margin-top: 40px;
          display: grid; grid-template-columns: 1fr 1fr; gap: 40px;
          font-size: 10pt;
        }
        .sig-line { border-bottom: 1px solid #000; padding-bottom: 2px; min-height: 18px; }
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: #fff; }
          .print-page { padding: 0; }
          .toolbar { display: none !important; }
          .sheet { box-shadow: none; padding: 0; min-height: auto; }
        }
      `}</style>

      <div className="toolbar">
        <a
          href="javascript:window.print()"
          style={{
            padding: "6px 12px",
            background: "#059669",
            color: "#fff",
            borderRadius: 4,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          🖨 Друкувати
        </a>
        <a
          href={`/manager/routes/${id}`}
          style={{ color: "#374151", textDecoration: "none", fontSize: 14 }}
        >
          ← Назад до документа
        </a>
        <span style={{ marginLeft: "auto", color: "#6b7280", fontSize: 13 }}>
          № {displayNumber} · {formatDate(sheet.date)}
        </span>
      </div>

      <div className="sheet">
        <h1>
          Маршрутний лист № {displayNumber} від {formatDate(sheet.date)}
        </h1>

        <div className="meta">
          <div>
            <span>Експедитор: </span>
            {sheet.expeditor?.fullName ?? "—"}
          </div>
          <div>
            <span>Маршрут: </span>
            {routeLabel}
          </div>
          {sheet.arrivalDate && (
            <div>
              <span>Дата прибуття: </span>
              {formatDate(sheet.arrivalDate)}
            </div>
          )}
          <div>
            <span>Кілометраж: </span>
            {sheet.mileageStartKm != null || sheet.mileageEndKm != null
              ? `${sheet.mileageStartKm ?? "—"} → ${sheet.mileageEndKm ?? "—"} км` +
                (mileageTotal != null ? ` (${mileageTotal} км)` : "")
              : "—"}
          </div>
          {sheet.pricePerKm != null && (
            <div>
              <span>Ціна за км: </span>
              {sheet.pricePerKm} ₴
            </div>
          )}
        </div>

        <h2>Замовлення / зупинки</h2>
        <table>
          <thead>
            <tr>
              <th className="num" style={{ width: 30 }}>
                №
              </th>
              <th>Клієнт</th>
              <th style={{ width: 140 }}>Місто</th>
              <th style={{ width: 120 }}>Замовлення</th>
            </tr>
          </thead>
          <tbody>
            {sheet.orders.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", color: "#777" }}>
                  Немає замовлень
                </td>
              </tr>
            ) : (
              sheet.orders.map((o, idx) => {
                const order = orderMap.get(o.orderId);
                const customer = o.customerId
                  ? customerMap.get(o.customerId)
                  : null;
                return (
                  <tr key={o.id}>
                    <td className="num">{idx + 1}</td>
                    <td>{customer?.name ?? "—"}</td>
                    <td>{o.city ?? customer?.city ?? "—"}</td>
                    <td>{order ? formatOrderNumber(order) : "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {sheet.items.length > 0 && (
          <>
            <h2>Товари</h2>
            <table>
              <thead>
                <tr>
                  <th className="num" style={{ width: 30 }}>
                    №
                  </th>
                  <th>Клієнт</th>
                  <th>Товар</th>
                  <th className="num" style={{ width: 70 }}>
                    К-сть
                  </th>
                  <th className="num" style={{ width: 80 }}>
                    Сума, €
                  </th>
                </tr>
              </thead>
              <tbody>
                {sheet.items.map((it, idx) => {
                  const product = productMap.get(it.productId);
                  const customer = it.customerId
                    ? customerMap.get(it.customerId)
                    : null;
                  return (
                    <tr key={it.id}>
                      <td className="num">{idx + 1}</td>
                      <td>{customer?.name ?? "—"}</td>
                      <td>{product?.name ?? "—"}</td>
                      <td className="num">
                        {it.quantity}
                        {it.unit ? ` ${it.unit}` : ""}
                      </td>
                      <td className="num">{money2(it.sum)}</td>
                    </tr>
                  );
                })}
                <tr className="total-row">
                  <td colSpan={4}>Разом:</td>
                  <td className="num">{money2(totalItemsSum)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {sheet.expenses.length > 0 && (
          <>
            <h2>Витрати</h2>
            <table>
              <thead>
                <tr>
                  <th className="num" style={{ width: 30 }}>
                    №
                  </th>
                  <th>Стаття</th>
                  <th className="num" style={{ width: 100 }}>
                    Сума, ₴
                  </th>
                </tr>
              </thead>
              <tbody>
                {sheet.expenses.map((e, idx) => (
                  <tr key={e.id}>
                    <td className="num">{idx + 1}</td>
                    <td>
                      {e.cashFlowArticle?.name ?? e.articleName ?? "—"}
                      {e.isMileage ? " (пробіг)" : ""}
                    </td>
                    <td className="num">{money2(e.amount)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td colSpan={2}>Разом:</td>
                  <td className="num">{money2(expensesTotal)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        <div className="signatures">
          <div>
            Здав (менеджер) <div className="sig-line"></div>
          </div>
          <div>
            Прийняв (експедитор) <div className="sig-line"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function money2(n: number): string {
  return n.toLocaleString("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}
