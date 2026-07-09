"use client";

import { useCallback, useMemo, useState } from "react";
import type { ClientDetail } from "../_components/types";

export interface EditableClientFields {
  name: string;
  tradePointName: string | null;
  region: string | null;
  city: string | null;
  street: string | null;
  house: string | null;
  novaPoshtaBranch: string | null;
  websiteUrl: string | null;
  geolocation: string | null;
  viberContact: string | null;
  email: string | null;
  legalType: string | null;
  inn: string | null;
  edrpou: string | null;
  fullName: string | null;
  comment: string | null;
  additionalDescription: string | null;
  workingHours: string | null;
  parentCode1C: string | null;
  monthlyVolume: number | null;
  licenseExpiresAt: string | null;
  hasNewMessage: boolean;
  isViberLinked: boolean;
  dialogStatus: string | null;
  statusGeneralId: string | null;
  statusOperationalId: string | null;
  categoryTTId: string | null;
  priceTypeId: string | null;
  primaryAssortmentId: string | null;
  deliveryMethodId: string | null;
  searchChannelId: string | null;
  primaryRouteId: string | null;
  agentUserId: string | null;
}

export type EditableClientField = keyof EditableClientFields;

export function extractEditableFields(
  client: ClientDetail,
): EditableClientFields {
  return {
    name: client.name,
    tradePointName: client.tradePointName,
    region: client.region,
    city: client.city,
    street: client.street,
    house: client.house,
    novaPoshtaBranch: client.novaPoshtaBranch,
    websiteUrl: client.websiteUrl,
    geolocation: client.geolocation,
    viberContact: client.viberContact,
    email: client.email,
    legalType: client.legalType,
    inn: client.inn,
    edrpou: client.edrpou,
    fullName: client.fullName,
    comment: client.comment,
    additionalDescription: client.additionalDescription,
    workingHours: client.workingHours,
    parentCode1C: client.parentCode1C,
    monthlyVolume:
      client.monthlyVolume == null || client.monthlyVolume === ""
        ? null
        : Number(client.monthlyVolume),
    licenseExpiresAt: client.licenseExpiresAt,
    hasNewMessage: client.hasNewMessage,
    isViberLinked: client.isViberLinked,
    dialogStatus: client.dialogStatus,
    statusGeneralId: client.statusGeneralId,
    statusOperationalId: client.statusOperationalId,
    categoryTTId: client.categoryTTId,
    priceTypeId: client.priceTypeId,
    primaryAssortmentId: client.primaryAssortmentId,
    deliveryMethodId: client.deliveryMethodId,
    searchChannelId: client.searchChannelId,
    primaryRouteId: client.primaryRouteId,
    agentUserId: client.agentUserId,
  };
}

export interface UseClientEditResult {
  values: EditableClientFields;
  isDirty: boolean;
  dirtyKeys: EditableClientField[];
  setField: <K extends EditableClientField>(
    key: K,
    value: EditableClientFields[K],
  ) => void;
  /** Замінити всі значення (напр. відновлення з локального буфера). */
  setAll: (next: EditableClientFields) => void;
  reset: () => void;
  diff: () => Partial<EditableClientFields>;
}

export function useClientEdit(client: ClientDetail): UseClientEditResult {
  const initial = useMemo(() => extractEditableFields(client), [client]);
  const [values, setValues] = useState<EditableClientFields>(initial);

  const dirtyKeys = useMemo<EditableClientField[]>(() => {
    const keys: EditableClientField[] = [];
    (Object.keys(initial) as EditableClientField[]).forEach((k) => {
      if (!shallowEqual(initial[k], values[k])) keys.push(k);
    });
    return keys;
  }, [initial, values]);

  const isDirty = dirtyKeys.length > 0;

  const setField = useCallback(
    <K extends EditableClientField>(key: K, value: EditableClientFields[K]) => {
      setValues((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const setAll = useCallback(
    (next: EditableClientFields) => setValues(next),
    [],
  );

  const reset = useCallback(() => setValues(initial), [initial]);

  const diff = useCallback((): Partial<EditableClientFields> => {
    const out: Partial<EditableClientFields> = {};
    dirtyKeys.forEach((k) => {
      (out as Record<string, unknown>)[k] = values[k];
    });
    return out;
  }, [dirtyKeys, values]);

  return { values, isDirty, dirtyKeys, setField, setAll, reset, diff };
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  return false;
}
