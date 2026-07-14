import { redirect } from "next/navigation";
import { prisma } from "@ltex/db";
import { getCurrentUser } from "@/lib/auth/manager-auth";
import { getCurrentRate } from "@/lib/exchange-rate";
import { getDeliveryMethodOptions } from "@/lib/manager/delivery-methods";
import { getActivePaymentRequisites } from "@/lib/manager/payment-requisites";
import { SaleForm } from "./_components/sale-form";
import type { ClientPickerItem } from "./_components/sale-types";
import { BackButton } from "../../_components/back-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Нова реалізація — L-TEX Manager" };

/** Останній курс USD→UAH з ExchangeRate (0 якщо ще не вивантажено). */
async function getUsdRate(): Promise<number> {
  try {
    const latest = await prisma.exchangeRate.findFirst({
      where: { currencyFrom: "USD", currencyTo: "UAH" },
      orderBy: { date: "desc" },
    });
    return latest?.rate ?? 0;
  } catch {
    return 0;
  }
}

export default async function NewSalePage({
  searchParams,
}: {
  searchParams: Promise<{
    clientId?: string;
    routeSheetId?: string;
    orderId?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/manager/login");

  const sp = await searchParams;
  const requestedClientId = sp.clientId ?? null;

  // МЛ-контекст: коли реалізацію створюють зсередини Маршрутного листа.
  // Перевіряємо існування МЛ (інакше ігноруємо параметр), щоб після збереження
  // повернути користувача на сторінку МЛ. `orderId` поки інформаційний —
  // central 1С не приймає точний лот; підбір іде через прайс (як у Замовленнях).
  let routeSheetId: string | null = null;
  if (sp.routeSheetId) {
    const sheet = await prisma.routeSheet.findUnique({
      where: { id: sp.routeSheetId },
      select: { id: true },
    });
    if (sheet) routeSheetId = sheet.id;
  }
  const returnHref = routeSheetId
    ? `/manager/routes/${routeSheetId}`
    : "/manager/sales";

  let initialClient: ClientPickerItem | null = null;
  if (requestedClientId) {
    const customer = await prisma.customer.findUnique({
      where: { id: requestedClientId },
      select: { id: true, code1C: true, name: true, city: true, phone: true },
    });
    if (customer) {
      const mgr = customer.code1C
        ? await prisma.mgrClient.findUnique({
            where: { code1C: customer.code1C },
            select: {
              debt: true,
              priceTypeId: true,
              phonePrimary: true,
              region: true,
              street: true,
              house: true,
              deliveryMethod: { select: { code: true } },
            },
          })
        : null;
      const address = mgr
        ? [mgr.street, mgr.house].filter(Boolean).join(", ") || null
        : null;
      initialClient = {
        id: customer.id,
        code1C: customer.code1C,
        name: customer.name,
        tradePointName: null,
        city: customer.city,
        region: mgr?.region ?? null,
        phone: customer.phone ?? mgr?.phonePrimary ?? null,
        address,
        debt: mgr?.debt?.toString() ?? "0",
        priceTypeId: mgr?.priceTypeId ?? null,
        deliveryMethodCode: mgr?.deliveryMethod?.code ?? null,
        agent: null,
        isOwned: true,
      };
    }
  }

  const [exchangeRateEur, exchangeRateUsd] = await Promise.all([
    getCurrentRate(),
    getUsdRate(),
  ]);

  // Способи доставки — з редагованого довідника (7.3).
  const deliveryMethods = await getDeliveryMethodOptions();
  // Набори реквізитів оплати (селектор «Скинути реквізити»).
  const paymentRequisites = await getActivePaymentRequisites();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <BackButton
        label={routeSheetId ? "Назад до маршруту" : "Назад до списку"}
        fallbackHref={returnHref}
      />

      <header>
        <h1 className="text-2xl font-bold text-gray-800">Нова реалізація</h1>
        <p className="mt-1 text-sm text-gray-500">
          Виберіть клієнта, відскануйте штрихкоди мішків або скористайтесь
          підбором, перевірте ціни та збережіть.
        </p>
      </header>

      <SaleForm
        initialClientId={initialClient?.id ?? null}
        initialClient={initialClient}
        exchangeRateEur={exchangeRateEur}
        exchangeRateUsd={exchangeRateUsd}
        deliveryMethods={deliveryMethods}
        paymentRequisites={paymentRequisites}
        currentUserId={user.id}
        currentUserName={user.fullName}
        routeSheetId={routeSheetId}
        returnHref={returnHref}
      />
    </div>
  );
}
