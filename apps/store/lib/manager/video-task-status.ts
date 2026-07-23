/**
 * Людські статуси відеозавдання (Відеозона) — щоб менеджер бачив, на якому
 * етапі його замовлення:
 *  • new                          → «Склад в роботі» (збирають/несуть мішки)
 *  • filming без виконавця        → «На відеозоні» (мішки принесено, чекає)
 *  • filming з виконавцем         → «В роботі відеооператора»
 *  • done                         → «Готово»
 *  • cancelled                    → «Скасовано»
 */
export interface VideoStatusMeta {
  label: string;
  cls: string;
}

export function videoTaskStatusMeta(task: {
  status: string;
  assignedUserId?: string | null;
  assignedName?: string | null;
}): VideoStatusMeta {
  switch (task.status) {
    case "new":
      return { label: "Склад в роботі", cls: "bg-amber-100 text-amber-700" };
    case "filming":
      return task.assignedUserId || task.assignedName
        ? {
            label: "В роботі відеооператора",
            cls: "bg-indigo-100 text-indigo-700",
          }
        : { label: "На відеозоні", cls: "bg-blue-100 text-blue-700" };
    case "done":
      return { label: "Готово", cls: "bg-green-100 text-green-700" };
    case "cancelled":
      return { label: "Скасовано", cls: "bg-gray-100 text-gray-500" };
    default:
      return { label: task.status, cls: "bg-gray-100 text-gray-500" };
  }
}
