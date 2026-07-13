import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import { prisma } from "@ltex/db";
import { COMPANY_REQUISITES } from "@/lib/constants/company";

export const dynamic = "force-dynamic";
export const metadata = { title: "Рахунок-замовлення — друк | L-TEX" };

/**
 * Друк-сторінка замовлення — «Рахунок-замовлення» (← 5.4.4, перший пас).
 *
 * Аналог 1С форми друку «Замовлення покупця»: A4 табличний документ з шапкою
 * (продавець / покупець), рядками (№ / Артикул / Товар / Мішків / Вага /
 * Ціна за кг / Сума), підсумками (сума EUR + грн, курс, доставка, примітка)
 * і місцем для підписів «Менеджер / Клієнт».
 *
 * @media print стилі прибирають UI-кнопки і виставляють A4-orientation
 * (дзеркало receivings/[id]/print).
 */
export default async function PrintOrderPage({
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
  ]);
  if (!user) notFound();
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: {
        select: { name: true, city: true, phone: true, code1C: true },
      },
      items: {
        orderBy: { id: "asc" },
        include: {
          product: { select: { name: true, articleCode: true } },
        },
      },
    },
  });
  if (!order) notFound();

  const mgr = order.customer.code1C
    ? await prisma.mgrClient.findUnique({
        where: { code1C: order.customer.code1C },
        select: { street: true, house: true, region: true },
      })
    : null;
  const buyerStreet = mgr
    ? [mgr.street, mgr.house].filter(Boolean).join(", ")
    : "";
  const buyerLocality = [order.customer.city, buyerStreet]
    .filter(Boolean)
    .join(", ");

  const totalQuantity = order.items.reduce((s, i) => s + i.quantity, 0);
  const totalWeightSum = order.items.reduce((s, i) => s + i.weight, 0);
  const totalAmountSum = order.items.reduce((s, i) => s + i.priceEur, 0);

  const displayNumber = order.code1C ?? order.id.slice(0, 8);

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
        .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 16px; }
        .party h2 { font-size: 10pt; margin: 0 0 4px; text-transform: uppercase; color: #555; }
        .party div { font-size: 10pt; line-height: 1.4; }
        table { width: 100%; border-collapse: collapse; }
        table th, table td {
          border: 1px solid #888;
          padding: 4px 6px;
          font-size: 10pt;
          vertical-align: top;
        }
        table th {
          background: #f3f4f6;
          font-weight: 600;
          text-align: left;
        }
        table td.num, table th.num { text-align: right; white-space: nowrap; }
        .total-row td { font-weight: 700; background: #fafafa; }
        .summary { margin-top: 12px; font-size: 10pt; line-height: 1.6; }
        .signatures {
          margin-top: 40px;
          display: grid; grid-template-columns: 1fr 1fr; gap: 40px;
          font-size: 10pt;
        }
        .sig-line {
          border-bottom: 1px solid #000;
          padding-bottom: 2px;
          min-height: 18px;
        }
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
          href={`/manager/orders/${id}`}
          style={{ color: "#374151", textDecoration: "none", fontSize: 14 }}
        >
          ← Назад до документа
        </a>
        <span style={{ marginLeft: "auto", color: "#6b7280", fontSize: 13 }}>
          № {displayNumber} · {formatDate(order.createdAt)}
        </span>
      </div>

      <div className="sheet">
        <h1>
          Рахунок-замовлення № {displayNumber} від {formatDate(order.createdAt)}
        </h1>

        <div className="parties">
          <div className="party">
            <h2>Продавець</h2>
            <div>{COMPANY_REQUISITES.legalName || COMPANY_REQUISITES.name}</div>
            <div>{COMPANY_REQUISITES.address}</div>
            <div>
              Тел.: {COMPANY_REQUISITES.phone}
              {COMPANY_REQUISITES.phone2 && `, ${COMPANY_REQUISITES.phone2}`}
            </div>
            {COMPANY_REQUISITES.edrpou && (
              <div>ЄДРПОУ/ІПН: {COMPANY_REQUISITES.edrpou}</div>
            )}
            {COMPANY_REQUISITES.iban && (
              <div>
                IBAN: {COMPANY_REQUISITES.iban}
                {COMPANY_REQUISITES.bankName &&
                  ` (${COMPANY_REQUISITES.bankName})`}
              </div>
            )}
          </div>
          <div className="party">
            <h2>Покупець</h2>
            <div>{order.customer.name}</div>
            {buyerLocality && <div>{buyerLocality}</div>}
            {order.customer.phone && <div>Тел.: {order.customer.phone}</div>}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th className="num" style={{ width: 30 }}>
                №
              </th>
              <th style={{ width: 80 }}>Артикул</th>
              <th>Товар</th>
              <th className="num" style={{ width: 60 }}>
                Мішків
              </th>
              <th className="num" style={{ width: 70 }}>
                Вага, кг
              </th>
              <th className="num" style={{ width: 80 }}>
                Ціна/кг, €
              </th>
              <th className="num" style={{ width: 80 }}>
                Сума, €
              </th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((it, idx) => (
              <tr key={it.id}>
                <td className="num">{idx + 1}</td>
                <td>{it.product.articleCode ?? "—"}</td>
                <td>{it.product.name}</td>
                <td className="num">{it.quantity}</td>
                <td className="num">{money2(it.weight)}</td>
                <td className="num">
                  {it.unitPriceEur != null ? money2(it.unitPriceEur) : "—"}
                  {it.discountPercent != null && it.discountPercent > 0 && (
                    <span style={{ color: "#b91c1c" }}>
                      {" "}
                      −{money2(it.discountPercent)}%
                    </span>
                  )}
                </td>
                <td className="num">{money2(it.priceEur)}</td>
              </tr>
            ))}
            <tr className="total-row">
              <td colSpan={3}>Разом:</td>
              <td className="num">{totalQuantity}</td>
              <td className="num">{money2(totalWeightSum)}</td>
              <td></td>
              <td className="num">{money2(totalAmountSum)}</td>
            </tr>
          </tbody>
        </table>

        <div className="summary">
          <div>
            <strong>
              Разом: {money2(order.totalEur)} € (
              {Math.round(order.totalUah).toLocaleString("uk-UA")} ₴)
            </strong>
          </div>
          {order.exchangeRate > 0 && (
            <div>Курс: {money2(order.exchangeRate)} ₴/€</div>
          )}
          {order.cashOnDelivery && <div>Накладений платіж: так</div>}
          {order.notes && <div>Примітка: {order.notes}</div>}
        </div>

        <div className="signatures">
          <div>
            Менеджер <div className="sig-line"></div>
          </div>
          <div>
            Клієнт <div className="sig-line"></div>
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
