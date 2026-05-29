import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { ClosuresClient } from "./_components/closures-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Закриття замовлень — L-TEX Manager" };

/**
 * M3.4 — Закриття старих замовлень (повна імплементація).
 *
 * UI flow:
 *  1. Менеджер обирає контрагента у `<ClientPicker>`.
 *  2. Натискає «Заповнити» → GET `/api/v1/manager/closures/<clientId>` →
 *     підвантажує список незакритих замовлень з центральної 1С через
 *     `services/manager-sync`.
 *  3. Бачить таблицю з колонками: Замовлення/Дата/Номенклатура/Замовлено/Сума/
 *     Продано/Статус + чекбокс «Додати в нове». Рядки де `sold >= quantity`
 *     підсвічуються зеленим (як у 1С v0-формі).
 *  4. Натискає «Закрити замовлення» → POST → 1С створює `Документ.ЗакрытиеЗаказовПокупателей`
 *     + опційно `Документ.ЗаказПокупателя`. UI показує toast і (якщо створено
 *     новий локальний Order) пропонує link на нього.
 *
 * Permission: лише manager/admin (через `getCurrentUser` гард).
 */
export default async function ClosuresPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">
          Закриття старих замовлень
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Виберіть контрагента, перегляньте незакриті замовлення з 1С і одним
          кліком закрийте їх (опційно перенесіть позиції у нове замовлення).
        </p>
      </header>

      <ClosuresClient currentUserId={user.id} userRole={user.role} />
    </div>
  );
}
