"use client";

import { Button, Input } from "@ltex/ui";
import { CURRENCIES } from "@ltex/shared";
import { addExchangeRate } from "./actions";

export function RateForm() {
  return (
    <form action={addExchangeRate} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1 block text-sm font-medium">З валюти</label>
        <select
          name="currencyFrom"
          defaultValue="EUR"
          className="rounded-md border px-3 py-2 text-sm"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">В валюту</label>
        <select
          name="currencyTo"
          defaultValue="UAH"
          className="rounded-md border px-3 py-2 text-sm"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Курс</label>
        <Input name="rate" type="number" step="0.0001" required placeholder="45.50" />
      </div>
      <Button type="submit">Зберегти</Button>
    </form>
  );
}
