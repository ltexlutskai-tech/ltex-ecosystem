import { RemindersClient } from "../../../reminders/_components/reminders-client";

interface Props {
  clientId: string;
  clientName: string;
  currentUserId: string;
  currentUserRole: string;
}

/**
 * Вкладка «Нагадування» картки клієнта — реюз standalone-екрану
 * `/manager/reminders`, прив'язаного до контрагента: список фільтрується по
 * `clientId`, форма створення приховує пікер і підставляє цього клієнта.
 */
export function ClientRemindersTab({
  clientId,
  clientName,
  currentUserId,
  currentUserRole,
}: Props) {
  return (
    <div id="reminders" className="space-y-4">
      <RemindersClient
        fixedClientId={clientId}
        fixedClientName={clientName}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
      />
    </div>
  );
}
