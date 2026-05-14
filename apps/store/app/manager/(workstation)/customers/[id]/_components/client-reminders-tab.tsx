import { ClientReminderItem } from "./client-reminder-item";
import { ClientRemindersForm } from "./client-reminders-form";
import { groupReminders } from "./client-reminders-grouping";
import type { ClientReminder } from "./types";

interface Props {
  clientId: string;
  reminders: ClientReminder[];
  currentUserId: string;
  currentUserRole: string;
}

export function ClientRemindersTab({
  clientId,
  reminders,
  currentUserId,
  currentUserRole,
}: Props) {
  const groups = groupReminders(reminders);
  const total = reminders.length;

  return (
    <div id="reminders" className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">
          Нагадування{" "}
          <span className="text-xs font-normal text-gray-500">({total})</span>
        </h2>
        <ClientRemindersForm clientId={clientId} />
      </div>

      {total === 0 && (
        <div className="rounded-lg border bg-white p-5 text-sm text-gray-500 shadow-sm">
          Нагадувань ще нема. Створіть перше через кнопку вище.
        </div>
      )}

      {groups.map((g) =>
        g.items.length === 0 ? null : (
          <section key={g.bucket} className="space-y-2">
            <h3
              className={`text-sm font-semibold ${
                g.bucket === "overdue"
                  ? "text-red-700"
                  : g.bucket === "today"
                    ? "text-blue-700"
                    : g.bucket === "done"
                      ? "text-gray-500"
                      : "text-gray-700"
              }`}
            >
              {g.title}{" "}
              <span className="text-xs font-normal text-gray-400">
                ({g.items.length})
              </span>
            </h3>
            <div className="space-y-2">
              {g.items.map((r) => (
                <ClientReminderItem
                  key={r.id}
                  clientId={clientId}
                  reminder={r}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                  bucket={g.bucket}
                />
              ))}
            </div>
          </section>
        ),
      )}
    </div>
  );
}
