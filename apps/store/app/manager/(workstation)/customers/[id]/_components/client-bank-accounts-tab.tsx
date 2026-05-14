"use client";

import { Copy } from "lucide-react";
import { useToast } from "@ltex/ui";
import type { ClientBankAccount } from "./types";

export function ClientBankAccountsTab({
  accounts,
}: {
  accounts: ClientBankAccount[];
}) {
  const visible = accounts.filter((a) => !a.isHidden);
  const { toast } = useToast();

  if (visible.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-5 text-sm text-gray-500 shadow-sm">
        Банківських рахунків не вказано.
      </div>
    );
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast({ description: `Скопійовано: ${value}` });
    } catch {
      toast({
        description: "Не вдалося скопіювати — спробуйте вручну",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-3">
      {visible.map((a) => (
        <div key={a.id} className="rounded-lg border bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-medium text-gray-900">
              {a.accountNumber}
            </span>
            <button
              type="button"
              onClick={() => copy(a.accountNumber)}
              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
              title="Копіювати IBAN"
            >
              <Copy className="h-3 w-3" /> Копіювати
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
            {a.bankName && <span>Банк: {a.bankName}</span>}
            {a.mfo && <span>МФО: {a.mfo}</span>}
          </div>
          {a.comment && (
            <p className="mt-2 text-xs text-gray-500">{a.comment}</p>
          )}
        </div>
      ))}
    </div>
  );
}
