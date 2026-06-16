import { prisma } from "@ltex/db";
import { EmptyState } from "../../../_components/empty-state";
import { ClientDebtCorrectionButton } from "./client-debt-correction-button";

const KIND_LABEL: Record<string, string> = {
  opening: "Початковий залишок",
  sale: "Реалізація",
  payment: "Оплата",
  correction: "Корекція",
};

/** Дата у форматі ДД.ММ.РРРР. */
function formatDateUkr(d: Date): string {
  return d.toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Сума у EUR зі знаком (+ червоне/нейтральне, − зелене). */
function AmountCell({ value }: { value: number }) {
  if (value < 0) {
    return (
      <span className="font-medium text-green-700">{value.toFixed(2)} €</span>
    );
  }
  if (value > 0) {
    return (
      <span className="font-medium text-red-700">+{value.toFixed(2)} €</span>
    );
  }
  return <span className="text-gray-500">0.00 €</span>;
}

export async function ClientDebtMovementsTab({
  clientId,
  canEdit,
}: {
  clientId: string;
  canEdit: boolean;
}) {
  const [client, movements] = await Promise.all([
    prisma.mgrClient.findUnique({
      where: { id: clientId },
      select: { debt: true },
    }),
    prisma.mgrDebtMovement.findMany({
      where: { clientId },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
  ]);

  const debt = client?.debt ? Number(client.debt) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Рухи боргу</h3>
          <p className="mt-1 text-sm text-gray-500">
            Поточний борг:{" "}
            <span
              className={
                debt > 0
                  ? "text-2xl font-bold text-red-700"
                  : debt < 0
                    ? "text-2xl font-bold text-green-700"
                    : "text-2xl font-bold text-gray-700"
              }
            >
              {debt.toFixed(2)} €
            </span>
          </p>
        </div>
        {canEdit && <ClientDebtCorrectionButton clientId={clientId} />}
      </div>

      {movements.length === 0 ? (
        <EmptyState
          message="Рухів боргу ще немає"
          hint="Тут з'являться рухи: початковий залишок, реалізації, оплати та корекції."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 font-medium">Дата</th>
                <th className="px-3 py-2 font-medium">Тип</th>
                <th className="px-3 py-2 text-right font-medium">Сума</th>
                <th className="px-3 py-2 font-medium">Примітка</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {movements.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50/60">
                  <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                    {formatDateUkr(m.occurredAt)}
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {KIND_LABEL[m.kind] ?? m.kind}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <AmountCell value={Number(m.amountEur)} />
                  </td>
                  <td className="px-3 py-2 text-gray-500">{m.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
