import { AlertTriangle } from "lucide-react";

/**
 * Banner у foreign-view картки клієнта.
 *
 * Менеджер може **відкрити** чужого клієнта (наприклад через прямий URL
 * або document picker у M1.5+), але контакти маскуються. Banner пояснює
 * стан UI та називає призначеного менеджера (якщо є).
 */
export function ClientForeignBanner({
  agentName,
}: {
  agentName: string | null;
}) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-4 text-sm"
    >
      <AlertTriangle
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
        aria-hidden
      />
      <div className="space-y-0.5">
        <strong className="block text-amber-900">Чужий клієнт.</strong>
        <p className="text-amber-800">
          {agentName
            ? `Призначений менеджер: ${agentName}. `
            : "Призначеного менеджера немає. "}
          Контакти приховано. Ви можете створювати документи.
        </p>
      </div>
    </div>
  );
}
