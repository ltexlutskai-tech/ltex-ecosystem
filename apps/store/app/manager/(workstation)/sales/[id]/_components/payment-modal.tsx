"use client";

import { useMemo, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  useToast,
} from "@ltex/ui";
import {
  computeChange,
  convertUahTo,
  type CashRates,
} from "@/lib/manager/cash-order";
import {
  CHANGE_CURRENCIES,
  type ChangeCurrency,
} from "@/lib/validations/manager-cash-order";

function uah(n: number): string {
  return `${Math.round(n).toLocaleString("uk-UA")} ₴`;
}

function parseAmount(raw: string): number {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const INPUT_CLASS =
  "h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500";

/**
 * Блок «Реалізація» — Етап 4. Модалка створення оплати (касовий ордер).
 * Суми у 3 валютах + безнал грн. Здача + плата рахуються live на клієнті
 * (`computeChange`/`convertUahTo`) за курсами-знімком реалізації.
 */
export function PaymentModal({
  open,
  onOpenChange,
  saleId,
  dueUah,
  rates,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string;
  dueUah: number;
  rates: CashRates;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [amountUah, setAmountUah] = useState("");
  const [amountEur, setAmountEur] = useState("");
  const [amountUsd, setAmountUsd] = useState("");
  const [amountUahCashless, setAmountUahCashless] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [cashFlowArticle, setCashFlowArticle] = useState("");
  const [comment, setComment] = useState("");
  const [changeCurrency, setChangeCurrency] = useState<ChangeCurrency>("UAH");
  const [submitting, setSubmitting] = useState(false);

  const paid = useMemo(
    () => ({
      uah: parseAmount(amountUah),
      eur: parseAmount(amountEur),
      usd: parseAmount(amountUsd),
      uahCashless: parseAmount(amountUahCashless),
    }),
    [amountUah, amountEur, amountUsd, amountUahCashless],
  );

  const { paidUah, changeUah } = useMemo(
    () => computeChange({ dueUah, paid, rates }),
    [dueUah, paid, rates],
  );

  const changeInCurrency = useMemo(
    () => convertUahTo(changeUah, changeCurrency, rates),
    [changeUah, changeCurrency, rates],
  );

  const totalPaid = paid.uah + paid.eur + paid.usd + paid.uahCashless;

  function reset(): void {
    setAmountUah("");
    setAmountEur("");
    setAmountUsd("");
    setAmountUahCashless("");
    setBankAccount("");
    setCashFlowArticle("");
    setComment("");
    setChangeCurrency("UAH");
  }

  async function submit(): Promise<void> {
    if (totalPaid <= 0) {
      toast({
        title: "Вкажіть суму оплати",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/manager/cash-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          saleId,
          amountUah: paid.uah,
          amountEur: paid.eur,
          amountUsd: paid.usd,
          amountUahCashless: paid.uahCashless,
          bankAccount: bankAccount.trim() || undefined,
          cashFlowArticle: cashFlowArticle.trim() || undefined,
          comment: comment.trim() || undefined,
          changeCurrency,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          title: body.error ?? `Помилка ${res.status}`,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Оплату створено" });
      reset();
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast({
        title: (e as Error).message ?? "Невідома помилка",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Створити оплату</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            До оплати:{" "}
            <span className="font-semibold text-gray-900">{uah(dueUah)}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Готівка, грн">
              <Input
                inputMode="decimal"
                value={amountUah}
                onChange={(e) => setAmountUah(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Безготівка, грн">
              <Input
                inputMode="decimal"
                value={amountUahCashless}
                onChange={(e) => setAmountUahCashless(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Готівка, EUR">
              <Input
                inputMode="decimal"
                value={amountEur}
                onChange={(e) => setAmountEur(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Готівка, USD">
              <Input
                inputMode="decimal"
                value={amountUsd}
                onChange={(e) => setAmountUsd(e.target.value)}
                placeholder="0"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Банк. рахунок">
              <Input
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                placeholder="—"
              />
            </Field>
            <Field label="Стаття руху коштів">
              <Input
                value={cashFlowArticle}
                onChange={(e) => setCashFlowArticle(e.target.value)}
                placeholder="—"
              />
            </Field>
          </div>

          <Field label="Коментар">
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="—"
            />
          </Field>

          <Field label="Валюта здачі">
            <select
              value={changeCurrency}
              onChange={(e) =>
                setChangeCurrency(e.target.value as ChangeCurrency)
              }
              className={INPUT_CLASS}
            >
              {CHANGE_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>

          <dl className="space-y-1 rounded-md border border-gray-200 p-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Сплачено (грн-екв.):</dt>
              <dd className="font-medium text-gray-900">{uah(paidUah)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Здача:</dt>
              <dd className="font-semibold text-green-700">
                {changeUah > 0
                  ? `${uah(changeUah)}${
                      changeCurrency !== "UAH"
                        ? ` (${changeInCurrency.toFixed(2)} ${changeCurrency})`
                        : ""
                    }`
                  : "—"}
              </dd>
            </div>
          </dl>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              Скасувати
            </Button>
            <Button
              type="button"
              disabled={submitting || totalPaid <= 0}
              onClick={submit}
            >
              {submitting ? "Збереження…" : "Створити оплату"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </span>
      {children}
    </label>
  );
}
