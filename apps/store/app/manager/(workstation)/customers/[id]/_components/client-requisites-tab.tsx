import { ClientEditToggle } from "./client-edit-toggle";
import type { EditDictionaries } from "../_lib/load-edit-dictionaries";
import type { ClientDetail } from "./types";

interface Props {
  client: ClientDetail;
  dictionaries: EditDictionaries;
  canEdit: boolean;
  currentUserRole: "manager" | "senior_manager" | "admin";
  editDisabledReason?: string;
  isForeign?: boolean;
  /** `Customer.id` (дзеркало по code1C) для prefill Замовлення/Реалізації. */
  customerId?: string | null;
}

export function ClientRequisitesTab({
  client,
  dictionaries,
  canEdit,
  currentUserRole,
  editDisabledReason,
  isForeign,
  customerId,
}: Props) {
  return (
    <ClientEditToggle
      client={client}
      dictionaries={dictionaries}
      canEdit={canEdit}
      currentUserRole={currentUserRole}
      editDisabledReason={editDisabledReason}
      isForeign={isForeign}
      customerId={customerId}
    />
  );
}
