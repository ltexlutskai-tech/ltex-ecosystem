"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, useToast } from "@ltex/ui";
import { TREASURY_CURRENCIES } from "@/lib/validations/manager-treasury";
import { useDocumentAutosave } from "@/lib/autosave/use-document-autosave";
import { AutosaveStatus, RestoreDraftBanner } from "../autosave-status";
import type { BankAccountOption, ArticleOption } from "./bank-payment-form";
import { currencySymbol } from "./treasury-status";

const INPUT_CLASS =
  "h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500";

const CASH_VALUE = "__cash__"; // сентинел «Готівкова каса» у select (=null у payload)

/** Серіалізований знімок стану переміщення готівки (localStorage + чернетка). */
interface CashTransferDraftData {
  fromAccount: string;
  toAccount: string;
  articleId: string;
  amountRaw: string;
  currency: string;
  rateEurRaw: string;
  comment: string;
}

function parseNum(raw: string): number {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Форма створення переміщення готівки (інкасація каса↔банк / каса↔каса). Рахунок
 * «Готівкова каса» = порожній рахунок (`null` у payload → сентинел `CASH`).
 */
export function CashTransferForm({
  basePath,
  listPath,
  bankAccounts,
  articles,
  defaultRateEur,
}: {
  basePath: string;
  listPath: string;
  bankAccounts: BankAccountOption[];
  articles: ArticleOption[];
  defaultRateEur: number;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [fromAccount, setFromAccount] = useState<string>(CASH_VALUE);
  const [toAccount, setToAccount] = useState<string>("");
  const [articleId, setArticleId] = useState("");
  const [amountRaw, setAmountRaw] = useState("");
  const [currency, setCurrency] = useState<string>("UAH");
  const [rateEurRaw, setRateEurRaw] = useState(String(defaultRateEur || ""));
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const amount = parseNum(amountRaw);
  const rateEur = parseNum(rateEurRaw);
  const amountEur = useMemo(() => {
    if (amount <= 0) return 0;
    if (currency === "EUR") return amount;
    return rateEur > 0 ? Math.round((amount / rateEur) * 100) / 100 : 0;
  }, [amount, currency, rateEur]);

  const sameAccount = fromAccount === toAccount;
  const canSubmit =
    !submitting &&
    amount > 0 &&
    rateEur > 0 &&
    Boolean(toAccount) &&
    !sameAccount;

  // ─── Автозбереження чернетки (наскрізне) ──────────────────────────────────
  // ⚠️ Грошова безпека: draft лише status="draft" — рухи ДДС ЛИШЕ при «Провести».
  const draftData = useMemo<CashTransferDraftData>(
    () => ({
      fromAccount,
      toAccount,
      articleId,
      amountRaw,
      currency,
      rateEurRaw,
      comment,
    }),
    [
      fromAccount,
      toAccount,
      articleId,
      amountRaw,
      currency,
      rateEurRaw,
      comment,
    ],
  );

  const draftBody = useCallback(
    (d: CashTransferDraftData): Record<string, unknown> => ({
      draft: true,
      fromAccountId: d.fromAccount === CASH_VALUE ? undefined : d.fromAccount,
      toAccountId:
        d.toAccount === CASH_VALUE ? undefined : d.toAccount || undefined,
      cashFlowArticleId: d.articleId || undefined,
      amount: parseNum(d.amountRaw),
      currency: d.currency,
      rateEur: parseNum(d.rateEurRaw),
      comment: d.comment.trim() || undefined,
    }),
    [],
  );

  const createDraftServer = useCallback(
    async (d: CashTransferDraftData): Promise<string> => {
      const res = await fetch(basePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftBody(d)),
      });
      if (!res.ok) throw new Error(`draft create ${res.status}`);
      const j = (await res.json()) as { id: string };
      return j.id;
    },
    [basePath, draftBody],
  );

  const updateDraftServer = useCallback(
    async (id: string, d: CashTransferDraftData): Promise<void> => {
      const res = await fetch(`${basePath}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftBody(d)),
      });
      if (!res.ok) throw new Error(`draft update ${res.status}`);
    },
    [basePath, draftBody],
  );

  const autosave = useDocumentAutosave<CashTransferDraftData>({
    docType: "cash-transfer",
    existingId: null,
    data: draftData,
    // Серверна чернетка можлива лише коли введено суму (гейт від порожніх draft).
    canCreateDraft: amount > 0,
    createDraft: createDraftServer,
    updateDraft: updateDraftServer,
    onIdAssigned: (id) => {
      setSavedId(id);
      window.history.replaceState(null, "", `${listPath}/${id}`);
    },
  });

  function applyRestore(d: CashTransferDraftData): void {
    setFromAccount(d.fromAccount);
    setToAccount(d.toAccount);
    setArticleId(d.articleId);
    setAmountRaw(d.amountRaw);
    setCurrency(d.currency);
    setRateEurRaw(d.rateEurRaw);
    setComment(d.comment);
    autosave.acceptRestore();
  }

  async function submit(): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      autosave.clearAll();
      // Фіналізуємо наявну чернетку PATCH-ем (дані повні) або POST нового draft.
      if (savedId) {
        const res = await fetch(`${basePath}/${savedId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draftBody(draftData)),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          toast({
            title: body.error ?? `Помилка ${res.status}`,
            variant: "destructive",
          });
          return;
        }
        toast({ title: "Документ збережено" });
        router.push(`${listPath}/${savedId}`);
        router.refresh();
        return;
      }
      const res = await fetch(basePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromAccountId: fromAccount === CASH_VALUE ? undefined : fromAccount,
          toAccountId: toAccount === CASH_VALUE ? undefined : toAccount,
          cashFlowArticleId: articleId || undefined,
          amount,
          currency,
          rateEur,
          comment: comment.trim() || undefined,
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
      const body = (await res.json()) as { id: string };
      toast({ title: "Документ створено" });
      router.push(`${listPath}/${body.id}`);
      router.refresh();
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
    <div className="space-y-4">
      {autosave.restoreData && (
        <RestoreDraftBanner
          onRestore={() =>
            applyRestore(autosave.restoreData as CashTransferDraftData)
          }
          onDismiss={autosave.dismissRestore}
        />
      )}

      <Section title="Звідки → куди">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Рахунок-джерело">
            <select
              value={fromAccount}
              onChange={(e) => setFromAccount(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value={CASH_VALUE}>Готівкова каса</option>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Рахунок-призначення">
            <select
              value={toAccount}
              onChange={(e) => setToAccount(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">— Виберіть —</option>
              <option value={CASH_VALUE}>Готівкова каса</option>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {sameAccount && Boolean(toAccount) && (
          <p className="mt-2 text-sm text-red-600">
            Джерело і призначення мають відрізнятись.
          </p>
        )}
      </Section>

      <Section title="Сума">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Сума">
            <Input
              inputMode="decimal"
              value={amountRaw}
              onChange={(e) => setAmountRaw(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Валюта">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={INPUT_CLASS}
            >
              {TREASURY_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Курс (грн за €)">
            <Input
              inputMode="decimal"
              value={rateEurRaw}
              onChange={(e) => setRateEurRaw(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>
        <p className="mt-2 text-sm text-gray-600">
          Сума: {amount.toFixed(2)} {currencySymbol(currency)} · зведено:{" "}
          <span className="font-semibold">{amountEur.toFixed(2)} €</span>
        </p>
        {rateEur <= 0 && (
          <p className="mt-1 text-sm text-red-600">
            Курс має бути більший за 0.
          </p>
        )}
      </Section>

      <Section title="Стаття та коментар">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Стаття руху коштів">
            <select
              value={articleId}
              onChange={(e) => setArticleId(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">— Без статті —</option>
              {articles.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code ? `${a.code} · ${a.name}` : a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Коментар">
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="—"
            />
          </Field>
        </div>
      </Section>

      <div className="flex items-center justify-end gap-2">
        <AutosaveStatus
          status={autosave.status}
          savedAt={autosave.savedAt}
          className="mr-auto"
        />
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={() => void submit()}
        >
          {submitting ? "Створення…" : "Створити"}
        </Button>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm">
      <h2 className="text-base font-semibold text-gray-800">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
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
    <label className="block min-w-0">
      <span className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </span>
      {children}
    </label>
  );
}
