import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { ClosuresClient } from "./_components/closures-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Закриття замовлень — L-TEX Manager" };

/**
 * Закриття старих замовлень — READ-ONLY огляд незакритих замовлень клієнта.
 *
 * UI flow:
 *  1. Менеджер обирає контрагента у `<ClientPicker>`.
 *  2. Натискає «Заповнити» → GET `/api/v1/manager/closures/<clientId>` →
 *     підвантажує незакриті замовлення клієнта з локальної БД.
 *  3. Бачить таблицю Замовлення/Дата/Номенклатура/Замовлено/Продано/Сума/
 *     Статус. «Продано» рахується локально через зв'язку `Sale.orderId`.
 *     Рядки де продано все (`sold >= quantity`) — підсвічуються зеленим.
 *  4. Щоб закрити замовлення — переходить за лінком на сторінку замовлення
 *     (`/manager/orders/[id]`), де є робоча кнопка закриття.
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
          Виберіть контрагента, перегляньте незакриті замовлення та прогрес
          продажів. Щоб закрити замовлення — відкрийте його (клік по номеру).
        </p>
      </header>

      <ClosuresClient currentUserId={user.id} userRole={user.role} />
    </div>
  );
}
