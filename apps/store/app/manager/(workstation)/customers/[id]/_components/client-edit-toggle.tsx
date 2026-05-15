"use client";

import { useState } from "react";
import { ClientRequisitesEdit } from "./client-requisites-edit";
import { ClientRequisitesView } from "./client-requisites-view";
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

export function ClientEditToggle({
  client,
  dictionaries,
  canEdit,
  currentUserRole,
  editDisabledReason,
  isForeign,
}: Props) {
  const [mode, setMode] = useState<"view" | "edit">("view");

  if (mode === "view") {
    return (
      <ClientRequisitesView
        client={client}
        canEdit={canEdit}
        onEditClick={canEdit ? () => setMode("edit") : undefined}
        editDisabledReason={editDisabledReason}
        isForeign={isForeign}
      />
    );
  }

  return (
    <ClientRequisitesEdit
      client={client}
      dictionaries={dictionaries}
      currentUserRole={currentUserRole}
      onCancel={() => setMode("view")}
      onSaved={() => setMode("view")}
    />
  );
}
