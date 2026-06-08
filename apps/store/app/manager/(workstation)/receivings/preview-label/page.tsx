import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/manager-auth";
import { generateBarcodeSvg } from "@/lib/warehouse/barcode-svg";

export const dynamic = "force-dynamic";
export const metadata = { title: "Друк етикетки | L-TEX" };

/**
 * Сторінка друку ОДНІЄЇ етикетки (без id документа).
 *
 * URL: /manager/receivings/preview-label?code=L-XXX-NNNNN&name=...&weight=...
 *
 * Використовується з форми поступлення для друку етикетки на ще-не-збережений
 * рядок (правки 2026-06-05). Якщо документ уже збережено — користуйтеся
 * `/manager/receivings/[id]/labels`.
 */
export default async function PreviewLabelPage({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string;
    name?: string;
    article?: string;
    weight?: string;
  }>;
}) {
  const user = await requireRole(["warehouse", "admin", "owner"]);
  if (!user) notFound();
  const sp = await searchParams;
  const code = sp.code?.trim() ?? "";
  const name = sp.name?.trim() ?? "—";
  const article = sp.article?.trim() ?? "";
  const weight = parseFloat(sp.weight ?? "0") || 0;

  if (!code) {
    return (
      <div style={{ padding: 40, color: "#6b7280" }}>
        Не вказано штрихкод (параметр `code`).
      </div>
    );
  }

  const svg = generateBarcodeSvg(code, {
    height: 32,
    narrowWidth: 1.4,
    wideRatio: 2.5,
  });

  return (
    <div className="labels-page">
      <style>{`
        body { margin: 0; }
        .labels-page { padding: 0; font-family: -apple-system, system-ui, sans-serif; }
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
          margin: 4mm;
          font-size: 10pt;
        }
        .label .name { font-size: 11pt; font-weight: 600; line-height: 1.1; max-height: 2.5em; overflow: hidden; }
        .label .row { display: flex; justify-content: space-between; font-size: 9pt; color: #444; }
        .label .barcode { display: flex; justify-content: center; }
        @media print {
          @page { size: 60mm 40mm; margin: 0; }
          .toolbar { display: none !important; }
          .label { border: none; margin: 0; width: 60mm; height: 40mm; }
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
          href="javascript:window.close()"
          style={{ color: "#374151", textDecoration: "none", fontSize: 14 }}
        >
          ✕ Закрити
        </a>
      </div>

      <div className="label">
        <div className="name">{name}</div>
        <div className="row">
          <span>
            <strong>{weight.toFixed(1)} кг</strong>
          </span>
          <span>Арт. {article || "—"}</span>
        </div>
        <div className="barcode" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    </div>
  );
}
