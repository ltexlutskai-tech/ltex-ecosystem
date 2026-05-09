"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button, Input } from "@ltex/ui";
import { UA_REGIONS } from "@ltex/shared";
import { updateProfileAction, type UpdateProfileResult } from "./actions";
import { getDictionary } from "@/lib/i18n";

const dict = getDictionary();

interface CustomerProfile {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  telegram: string | null;
  city: string | null;
  // `Customer.notes` is admin-only and not exposed in this form; see Fix 12.
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? dict.auth.profileSaving : dict.auth.profileSave}
    </Button>
  );
}

export function ProfileForm({ customer }: { customer: CustomerProfile }) {
  const [state, formAction] = useFormState<
    UpdateProfileResult | undefined,
    FormData
  >(updateProfileAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label
            htmlFor="profile-name"
            className="text-sm font-medium leading-none"
          >
            {dict.auth.fields.name}
          </label>
          <Input
            id="profile-name"
            name="name"
            defaultValue={customer.name}
            required
            maxLength={100}
            autoComplete="name"
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="profile-phone"
            className="text-sm font-medium leading-none"
          >
            {dict.auth.fields.phone}
          </label>
          <Input
            id="profile-phone"
            name="phone"
            defaultValue={customer.phone}
            disabled
            readOnly
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="profile-email"
            className="text-sm font-medium leading-none"
          >
            {dict.auth.fields.email}
          </label>
          <Input
            id="profile-email"
            name="email"
            type="email"
            defaultValue={customer.email ?? ""}
            maxLength={120}
            autoComplete="email"
          />
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="profile-telegram"
            className="text-sm font-medium leading-none"
          >
            {dict.auth.fields.telegram}
          </label>
          <Input
            id="profile-telegram"
            name="telegram"
            defaultValue={customer.telegram ?? ""}
            maxLength={50}
            placeholder="@nickname"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label
            htmlFor="profile-city"
            className="text-sm font-medium leading-none"
          >
            {dict.auth.regionLabel}
          </label>
          <select
            id="profile-city"
            name="city"
            defaultValue={customer.city ?? ""}
            autoComplete="address-level1"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">{dict.auth.regionPlaceholder}</option>
            {UA_REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            {customer.city &&
              !(UA_REGIONS as readonly string[]).includes(customer.city) && (
                <option value={customer.city}>{customer.city}</option>
              )}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton />
        {state?.ok && (
          <p className="text-sm text-green-700">{dict.auth.profileSaved}</p>
        )}
        {state && state.ok === false && state.error && (
          <p className="text-sm text-red-600">{state.error}</p>
        )}
      </div>
    </form>
  );
}
