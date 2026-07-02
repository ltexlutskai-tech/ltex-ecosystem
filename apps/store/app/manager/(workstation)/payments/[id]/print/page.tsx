import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import { prisma } from "@ltex/db";
import { COMPANY_REQUISITES } from "@/lib/constants/company";
import { formatDocNumber } from "@/lib/manager/order-number";

export const dynamic = "force-dynamic";
export const metadata = { title: "Касовий ордер — друк | L-TEX" };

/**
 * Друк-сторінка касового ордера — КО-1 (Прибутковий) / КО-2 (Видатковий).
 *
 * Аналог типової форми КО-1/КО-2: A4-бланк з шапкою (підприємство), номером/датою,
 * рядком «Прийнято від / Видати» (контрагент), «Підстава» (реалізація + стаття
 * руху коштів), сумою (₴ головна + € довідково) і місцем для підписів
 * «Головний бухгалтер / Касир» + «Прийняв / Видав».
 *
 * @media print стилі прибирають UI-кнопки і виставляють A4-orientation
 * (дзеркало sales/[id]/print).
 */
export default async function PrintCashOrderPage({
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

  const order = await prisma.mgrCashOrder.findUnique({
    where: { id },
    include: {
      customer: { select: { name: true, phone: true } },
      sale: {
        select: { code1C: true, number1C: true, docNumber: true },
      },
      bankAccountRef: { select: { name: true } },
      cashFlowArticleRef: { select: { name: true } },
    },
  });
  if (!order) notFound();

  const isIncome = order.type === "income";
  const koLabel = isIncome ? "КО-1" : "КО-2";
  const koTitle = isIncome
    ? "Прибутковий касовий ордер"
    : "Видатковий касовий ордер";
  const counterpartyLabel = isIncome ? "Прийнято від" : "Видати";
  const displayNumber = formatDocNumber(order);

  // Підстава: реалізація + стаття руху коштів.
  const saleRef = order.sale
    ? `реалізація № ${formatDocNumber(order.sale)}`
    : "";
  const articleRef = order.cashFlowArticleRef?.name ?? "";
  const basis = [saleRef, articleRef].filter(Boolean).join("; ") || "—";

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
          background: #fff; padding: 20mm; min-height: 14cm;
          font-family: -apple-system, system-ui, sans-serif;
          font-size: 10pt; color: #000;
          border-radius: 4px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .ko-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
        .ko-org { font-size: 10pt; line-height: 1.4; }
        .ko-form { font-size: 9pt; color: #555; text-align: right; }
        .sheet h1 { font-size: 14pt; margin: 12px 0 4px; text-align: center; }
        .ko-sub { text-align: center; font-size: 10pt; color: #555; margin-bottom: 16px; }
        .rows { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .rows td { padding: 6px 6px; font-size: 10pt; vertical-align: top; border-bottom: 1px solid #ccc; }
        .rows td.k { width: 32%; color: #555; }
        .rows td.v { font-weight: 600; }
        .amount { margin-top: 16px; font-size: 12pt; }
        .amount strong { font-size: 14pt; }
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
          href={`/manager/payments/${id}`}
          style={{ color: "#374151", textDecoration: "none", fontSize: 14 }}
        >
          ← Назад до документа
        </a>
        <span style={{ marginLeft: "auto", color: "#6b7280", fontSize: 13 }}>
          № {displayNumber} · {formatDate(order.paidAt)}
        </span>
      </div>

      <div className="sheet">
        <div className="ko-head">
          <div className="ko-org">
            <div>{COMPANY_REQUISITES.legalName || COMPANY_REQUISITES.name}</div>
            {COMPANY_REQUISITES.edrpou && (
              <div>ЄДРПОУ/ІПН: {COMPANY_REQUISITES.edrpou}</div>
            )}
            <div>{COMPANY_REQUISITES.address}</div>
          </div>
          <div className="ko-form">Типова форма № {koLabel}</div>
        </div>

        <h1>{koTitle}</h1>
        <div className="ko-sub">
          № {displayNumber} від {formatDate(order.paidAt)}
        </div>

        <table className="rows">
          <tbody>
            <tr>
              <td className="k">{counterpartyLabel}</td>
              <td className="v">
                {order.customer?.name ?? "—"}
                {order.customer?.phone ? ` (${order.customer.phone})` : ""}
              </td>
            </tr>
            <tr>
              <td className="k">Підстава</td>
              <td className="v">{basis}</td>
            </tr>
            {order.bankAccountRef?.name && (
              <tr>
                <td className="k">Каса / рахунок</td>
                <td className="v">{order.bankAccountRef.name}</td>
              </tr>
            )}
            {order.comment && (
              <tr>
                <td className="k">Примітка</td>
                <td className="v">{order.comment}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="amount">
          Сума:{" "}
          <strong>
            {Math.round(order.amountUah).toLocaleString("uk-UA")} ₴
          </strong>
          {order.documentSumEur > 0 && (
            <span style={{ color: "#555" }}>
              {" "}
              ({money2(order.documentSumEur)} €)
            </span>
          )}
          {order.amountUahCashless > 0 && (
            <div style={{ fontSize: "10pt", color: "#555", marginTop: 4 }}>
              у т.ч. безготівка:{" "}
              {Math.round(order.amountUahCashless).toLocaleString("uk-UA")} ₴
            </div>
          )}
          {order.amountEur > 0 && (
            <div style={{ fontSize: "10pt", color: "#555" }}>
              валюта: {money2(order.amountEur)} €
            </div>
          )}
          {order.amountUsd > 0 && (
            <div style={{ fontSize: "10pt", color: "#555" }}>
              валюта: {money2(order.amountUsd)} $
            </div>
          )}
        </div>

        <div className="signatures">
          <div>
            Головний бухгалтер <div className="sig-line"></div>
          </div>
          <div>
            Касир <div className="sig-line"></div>
          </div>
          <div>
            {isIncome ? "Прийняв" : "Видав"} <div className="sig-line"></div>
          </div>
          <div>
            {isIncome ? "Здав" : "Отримав"} <div className="sig-line"></div>
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
