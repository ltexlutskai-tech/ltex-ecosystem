import { ClientStatusBadge } from "../../_components/client-status-badge";
import { formatUah, parseDecimal } from "../../_components/format";
import { ClientAssignDialog } from "./client-assign-dialog";
import { ClientContactsStrip } from "./client-contacts-strip";
import { ClientForeignBanner } from "./client-foreign-banner";
import type { ClientDetail } from "./types";

export function ClientHeader({
  client,
  canAssign,
}: {
  client: ClientDetail;
  canAssign: boolean;
}) {
  const debtN = parseDecimal(client.debt);
  const isForeign = client.viewerOwnership === "foreign";
  return (
    <div className="space-y-3">
      {isForeign && (
        <ClientForeignBanner agentName={client.agent?.fullName ?? null} />
      )}
      <header className="rounded-lg border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">
                {client.name}
                {client.phonePrimary && (
                  <span className="ml-2 text-base font-normal text-gray-500">
                    ({client.phonePrimary})
                  </span>
                )}
              </h1>
              <ClientStatusBadge status={client.statusGeneral} />
              {client.statusOperational && (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                  📞 {client.statusOperational.label} · цей місяць
                </span>
              )}
            </div>
            {(client.region || client.city) && (
              <p className="text-sm text-gray-600">
                {[client.region, client.city].filter(Boolean).join(" · ")}
              </p>
            )}
            <ClientContactsStrip client={client} isForeign={isForeign} />
            <div className="flex flex-wrap items-center gap-4 pt-2 text-sm">
              <span className="text-gray-700">
                Борг:{" "}
                <span
                  className={
                    debtN > 0
                      ? "font-semibold text-red-700"
                      : debtN < 0
                        ? "font-semibold text-green-700"
                        : "font-semibold text-gray-700"
                  }
                >
                  {formatUah(client.debt)}
                </span>
              </span>
              <span className="text-gray-300">·</span>
              <span className="text-gray-700">
                Менеджер:{" "}
                <span className="font-medium">
                  {client.assignedManager?.fullName ?? (
                    <em className="font-normal text-gray-500">не призначено</em>
                  )}
                </span>
              </span>
            </div>
          </div>
          {canAssign && (
            <ClientAssignDialog
              clientId={client.id}
              currentManager={client.assignedManager}
            />
          )}
        </div>
      </header>
    </div>
  );
}
