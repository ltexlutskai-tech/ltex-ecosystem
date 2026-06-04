import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import { prisma } from "@ltex/db";
import { generateBarcodeSvg } from "@/lib/warehouse/barcode-svg";

export const dynamic = "force-dynamic";
export const metadata = { title: "Друк етикеток | L-TEX" };

/**
 * Сторінка друку етикеток для всіх рядків документа поступлення.
 *
 * URL: /manager/receivings/{id}/labels[?only=itemId1,itemId2]
 *
 * Етикетка 60×40 мм (типовий розмір термо-етикетки). Структура:
 *   - назва товару (велике)
 *   - вага в кг
 *   - штрихкод (Code 39) з підписом
 *   - артикул + дата поступлення
 *
 * Друкується через нативний `window.print()` (Ctrl+P). CSS @page +
 * @media print контролює розмір сторінки і прибирає UI-кнопки.
 */
export default async function LabelsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ only?: string }>;
}) {
  const user = await requireRole(["warehouse", "admin", "owner"]);
  if (!user) notFound();
  const { id } = await params;
  const sp = await searchParams;

  const doc = await prisma.receiving.findUnique({
    where: { id },
    select: {
      docNumber: true,
      docDate: true,
      supplier: { select: { name: true } },
      items: {
        select: {
          id: true,
          barcode: true,
          weight: true,
          product: {
            select: { name: true, articleCode: true },
          },
        },
      },
    },
  });
  if (!doc) notFound();

  // Фільтрація за `?only=itemId1,itemId2`
  const onlyIds = sp.only ? sp.only.split(",").filter(Boolean) : null;
  const items = (
    onlyIds ? doc.items.filter((it) => onlyIds.includes(it.id)) : doc.items
  ).filter((it) => it.barcode);

  const docDateStr = formatDate(doc.docDate);

  return (
    <div className="labels-page">
      <style>{`
        .labels-page { padding: 0; margin: 0; }
        .toolbar {
          padding: 12px 16px; border-bottom: 1px solid #e5e7eb;
          display: flex; gap: 8px; align-items: center;
        }
        .label {
          width: 60mm; height: 40mm;
          padding: 3mm; box-sizing: border-box;
          border: 1px solid #d1d5db; border-radius: 2px;
          display: flex; flex-direction: column; justify-content: space-between;
          background: #fff;
          page-break-inside: avoid;
          break-inside: avoid;
          margin: 4mm;
          font-family: -apple-system, system-ui, sans-serif;
          font-size: 10pt;
        }
        .label .name { font-size: 11pt; font-weight: 600; line-height: 1.1; max-height: 2.5em; overflow: hidden; }
        .label .row { display: flex; justify-content: space-between; font-size: 9pt; color: #444; }
        .label .barcode { display: flex; justify-content: center; }
        .grid { display: flex; flex-wrap: wrap; padding: 4mm; }
        @media print {
          @page { size: A4; margin: 5mm; }
          .toolbar { display: none !important; }
          .label { border: none; margin: 2mm; }
          .grid { padding: 0; }
        }
      `}</style>
      <div className="toolbar">
        <a
          href="javascript:window.print()"
          style={{
            padding: "6px 12px",
            background: "#059669",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
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
          Документ {doc.docNumber} · {docDateStr} · {items.length} етикеток
        </span>
      </div>

      {items.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>
          Немає рядків зі штрихкодами для друку.
        </div>
      ) : (
        <div className="grid">
          {items.map((it) => (
            <Label
              key={it.id}
              productName={it.product.name}
              articleCode={it.product.articleCode}
              weight={it.weight}
              barcode={it.barcode ?? ""}
              date={docDateStr}
              supplierName={doc.supplier.name}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Label({
  productName,
  articleCode,
  weight,
  barcode,
  date,
  supplierName,
}: {
  productName: string;
  articleCode: string | null;
  weight: number;
  barcode: string;
  date: string;
  supplierName: string;
}) {
  const svg = generateBarcodeSvg(barcode, {
    height: 32,
    narrowWidth: 1.4,
    wideRatio: 2.5,
  });
  return (
    <div className="label">
      <div className="name">{productName}</div>
      <div className="row">
        <span>
          <strong>{weight.toFixed(1)} кг</strong>
        </span>
        <span>Арт. {articleCode ?? "—"}</span>
      </div>
      <div className="barcode" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="row" style={{ fontSize: "7pt", color: "#888" }}>
        <span>{supplierName}</span>
        <span>{date}</span>
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
