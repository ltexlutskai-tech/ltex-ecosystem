"use client";

import { Copy } from "lucide-react";
import { useToast } from "@ltex/ui";
import type { ClientBankAccount } from "./types";

/**
 * Read-only рядок «Розрахунковий рахунок» усередині вкладки «Реквізити».
 * Значення приходить з 1С (окремої вкладки «Банк. рахунки» більше немає).
 * Показує номер рахунку (monospace) + банк/МФО + кнопку копіювання IBAN.
 */
export function ClientBankAccountRow({
  account,
}: {
  account: ClientBankAccount;
}) {
  const { toast } = useToast();

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

  const meta = [
    account.bankName ? `Банк: ${account.bankName}` : null,
    account.mfo ? `МФО: ${account.mfo}` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-medium text-gray-900">
          {account.accountNumber}
        </span>
        <button
          type="button"
          onClick={() => copy(account.accountNumber)}
          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
          title="Копіювати IBAN"
        >
          <Copy className="h-3 w-3" /> Копіювати
        </button>
      </div>
      {meta.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
          {meta.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
      )}
    </div>
  );
}
