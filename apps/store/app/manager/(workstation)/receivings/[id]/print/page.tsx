import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import { prisma } from "@ltex/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Накладна — друк | L-TEX" };

/**
 * Друк-сторінка документа поступлення (← Хвиля 2 правок 2026-06-05).
 *
 * Аналог 1С форми друку «Поступлення товарів і послуг» — табличний документ
 * з колонками: № / Артикул / Товар / Кількість / Ціна за кг / Вага / Сума,
 * шапкою (постачальник, склад, дата) і футером з підсумками + місцем
 * для підписів «Відвантажив / Отримав».
 *
 * @media print стилі прибирають UI-кнопки і виставляють A4-orientation.
 */
export default async function PrintReceivingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole([
    "warehouse",
    "admin",
    "owner",
    "supervisor",
    "analyst",
    "bookkeeper",
  ]);
  if (!user) notFound();
  const { id } = await params;

  const doc = await prisma.receiving.findUnique({
    where: { id },
    include: {
      supplier: { select: { name: true, fullName: true } },
      warehouse: { select: { name: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          product: { select: { name: true, articleCode: true } },
        },
      },
    },
  });
  if (!doc) notFound();

  const canSeePrice = user.role === "admin" || user.role === "owner";

  // Якщо ціни недоступні (warehouse) — приховуємо колонки Ціна і Сума
  const totalQuantity = doc.items.length;
  const totalWeightSum = doc.items.reduce((s, i) => s + i.weight, 0);
  const totalAmountSum = doc.items.reduce(
    (s, i) => s + i.weight * i.purchasePrice,
    0,
  );

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
        .header-grid { display: grid; grid-template-columns: 100px 1fr; gap: 4px 12px; margin-bottom: 14px; font-size: 10pt; }
        .header-grid .label { color: #555; }
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
        .summary { margin-top: 12px; font-size: 10pt; }
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
          href={`/manager/receivings/${id}`}
          style={{ color: "#374151", textDecoration: "none", fontSize: 14 }}
        >
          ← Назад до документа
        </a>
        <span style={{ marginLeft: "auto", color: "#6b7280", fontSize: 13 }}>
          {doc.docNumber} · {formatDate(doc.docDate)}
        </span>
      </div>

      <div className="sheet">
        <h1>
          Поступлення товарів та послуг {doc.docNumber} від{" "}
          {formatDate(doc.docDate)}
        </h1>

        <div className="header-grid">
          <span className="label">Постачальник:</span>
          <span>{doc.supplier.fullName ?? doc.supplier.name}</span>
          <span className="label">Склад:</span>
          <span>{doc.warehouse.name}</span>
          <span className="label">Договір:</span>
          <span>Основний договір</span>
        </div>

        <table>
          <thead>
            <tr>
              <th className="num" style={{ width: 30 }}>
                №
              </th>
              <th style={{ width: 80 }}>Артикул</th>
              <th>Товар</th>
              <th className="num" style={{ width: 70 }}>
                Кількість
              </th>
              {canSeePrice && (
                <th className="num" style={{ width: 80 }}>
                  Ціна за кг
                </th>
              )}
              <th className="num" style={{ width: 70 }}>
                Вага
              </th>
              {canSeePrice && (
                <th className="num" style={{ width: 80 }}>
                  Сума
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {doc.items.map((it, idx) => (
              <tr key={it.id}>
                <td className="num">{idx + 1}</td>
                <td>{it.product.articleCode ?? "—"}</td>
                <td>{it.product.name}</td>
                <td className="num">1 шт</td>
                {canSeePrice && (
                  <td className="num">{it.purchasePrice.toFixed(2)}</td>
                )}
                <td className="num">{it.weight.toFixed(2)}</td>
                {canSeePrice && (
                  <td className="num">
                    {(it.weight * it.purchasePrice).toFixed(2)}
                  </td>
                )}
              </tr>
            ))}
            <tr className="total-row">
              <td colSpan={3}>Разом:</td>
              <td className="num">{totalQuantity} шт</td>
              {canSeePrice && <td></td>}
              <td className="num">{totalWeightSum.toFixed(2)}</td>
              {canSeePrice && (
                <td className="num">{totalAmountSum.toFixed(2)}</td>
              )}
            </tr>
          </tbody>
        </table>

        {canSeePrice && (
          <div className="summary">
            <strong>
              Всього найменувань {totalQuantity}, на суму{" "}
              {totalAmountSum.toFixed(2)} EUR
            </strong>
          </div>
        )}

        <div className="signatures">
          <div>
            Відвантажив <div className="sig-line"></div>
          </div>
          <div>
            Отримав <div className="sig-line"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}
