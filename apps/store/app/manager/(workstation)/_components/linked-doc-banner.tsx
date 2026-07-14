import Link from "next/link";
import { ArrowRight, FileText, Receipt } from "lucide-react";

/**
 * Інфо-банер про пов'язаний документ (замовлення ↔ реалізація).
 *
 * Сайтові замовлення з конкретними лотами авто-створюють реалізацію
 * (`Sale.orderId`). Раніше цей зв'язок ніде не показувався. Банер рендериться
 * над формою: у замовленні → лінк на реалізацію, у реалізації → лінк на
 * замовлення. Коли один документ видаляють, зв'язок зникає автоматично
 * (`Sale.orderId` = SetNull; live-запити `force-dynamic`), тож банер зникає.
 */
export function LinkedDocBanner({
  kind,
  href,
  number,
}: {
  /** Тип ЦЬОГО (пов'язаного) документа, на який веде банер. */
  kind: "order" | "sale";
  href: string;
  /** Людський номер пов'язаного документа (для показу). */
  number: string;
}) {
  const isOrder = kind === "order";
  const Icon = isOrder ? FileText : Receipt;
  const title = isOrder ? "Пов'язане замовлення" : "Пов'язана реалізація";
  const label = isOrder ? `Замовлення ${number}` : `Реалізація ${number}`;

  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm transition hover:border-blue-300 hover:bg-blue-100"
    >
      <Icon className="h-5 w-5 shrink-0 text-blue-600" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium uppercase tracking-wide text-blue-500">
          {title}
        </div>
        <div className="truncate font-medium text-blue-800">{label}</div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-blue-500" />
    </Link>
  );
}
