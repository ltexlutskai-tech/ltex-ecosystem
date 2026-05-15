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
}

export function ClientRequisitesTab({
  client,
  dictionaries,
  canEdit,
  currentUserRole,
  editDisabledReason,
  isForeign,
}: Props) {
  return (
    <ClientEditToggle
      client={client}
      dictionaries={dictionaries}
      canEdit={canEdit}
      currentUserRole={currentUserRole}
      editDisabledReason={editDisabledReason}
      isForeign={isForeign}
    />
  );
}
