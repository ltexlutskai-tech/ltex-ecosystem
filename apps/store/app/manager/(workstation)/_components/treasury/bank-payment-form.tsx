"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, useToast } from "@ltex/ui";
import { TREASURY_CURRENCIES } from "@/lib/validations/manager-treasury";
import { useDocumentAutosave } from "@/lib/autosave/use-document-autosave";
import { AutosaveStatus, RestoreDraftBanner } from "../autosave-status";
import { ClientPicker } from "../../orders/new/_components/client-picker";
import type { ClientPickerItem } from "../../orders/new/_components/types";
import { currencySymbol } from "./treasury-status";

/** Серіалізований знімок стану банк-платіжки (localStorage + серверна чернетка). */
interface BankPaymentDraftData {
  clientId: string | null;
  bankAccountId: string;
  articleId: string;
  amountRaw: string;
  currency: string;
  rateEurRaw: string;
  iban: string;
  purpose: string;
  comment: string;
}

export interface BankAccountOption {
  id: string;
  name: string;
}
export interface ArticleOption {
  id: string;
  code: string | null;
  name: string;
}

const INPUT_CLASS =
  "h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500";

function parseNum(raw: string): number {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Форма створення банк-платіжки (спільна для вхідної/вихідної). `direction`
 * керує підписами й тим, чи стаття обов'язкова (для вихідної — так). Контрагент
 * обирається наявним `ClientPicker`.
 */
export function BankPaymentForm({
  direction,
  basePath,
  listPath,
  bankAccounts,
  articles,
  defaultRateEur,
}: {
  direction: "incoming" | "outgoing";
  basePath: string;
  listPath: string;
  bankAccounts: BankAccountOption[];
  articles: ArticleOption[];
  defaultRateEur: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isOutgoing = direction === "outgoing";

  const [clientId, setClientId] = useState<string | null>(null);
  const [bankAccountId, setBankAccountId] = useState("");
  const [articleId, setArticleId] = useState("");
  const [amountRaw, setAmountRaw] = useState("");
  const [currency, setCurrency] = useState<string>("UAH");
  const [rateEurRaw, setRateEurRaw] = useState(String(defaultRateEur || ""));
  const [iban, setIban] = useState("");
  const [purpose, setPurpose] = useState("");
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

  const canSubmit =
    !submitting &&
    Boolean(bankAccountId) &&
    amount > 0 &&
    rateEur > 0 &&
    (!isOutgoing || Boolean(articleId));

  // ─── Автозбереження чернетки (наскрізне) ──────────────────────────────────
  // Дворівневий захист. ⚠️ Грошова безпека: draft лише status="draft" — рухи ДДС
  // з'являються ЛИШЕ при «Провести» (окремий крок на картці документа).
  const draftData = useMemo<BankPaymentDraftData>(
    () => ({
      clientId,
      bankAccountId,
      articleId,
      amountRaw,
      currency,
      rateEurRaw,
      iban,
      purpose,
      comment,
    }),
    [
      clientId,
      bankAccountId,
      articleId,
      amountRaw,
      currency,
      rateEurRaw,
      iban,
      purpose,
      comment,
    ],
  );

  const draftBody = useCallback(
    (d: BankPaymentDraftData): Record<string, unknown> => ({
      draft: true,
      customerId: d.clientId ?? undefined,
      bankAccountId: d.bankAccountId || undefined,
      cashFlowArticleId: d.articleId || undefined,
      amount: parseNum(d.amountRaw),
      currency: d.currency,
      rateEur: parseNum(d.rateEurRaw),
      iban: d.iban.trim() || undefined,
      purpose: d.purpose.trim() || undefined,
      comment: d.comment.trim() || undefined,
    }),
    [],
  );

  const createDraftServer = useCallback(
    async (d: BankPaymentDraftData): Promise<string> => {
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
    async (id: string, d: BankPaymentDraftData): Promise<void> => {
      const res = await fetch(`${basePath}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftBody(d)),
      });
      if (!res.ok) throw new Error(`draft update ${res.status}`);
    },
    [basePath, draftBody],
  );

  const autosave = useDocumentAutosave<BankPaymentDraftData>({
    docType: `bank-payment-${direction}`,
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

  function applyRestore(d: BankPaymentDraftData): void {
    setClientId(d.clientId);
    setBankAccountId(d.bankAccountId);
    setArticleId(d.articleId);
    setAmountRaw(d.amountRaw);
    setCurrency(d.currency);
    setRateEurRaw(d.rateEurRaw);
    setIban(d.iban);
    setPurpose(d.purpose);
    setComment(d.comment);
    autosave.acceptRestore();
  }

  async function submit(): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // Гасимо чергу autosave, щоб відкладений draft-PATCH не наклав поверх.
      autosave.clearAll();
      // Якщо autosave вже створив чернетку (`savedId`) — фіналізуємо її PATCH-ем
      // (дані повні, бо canSubmit); інакше — POST нового draft-документа.
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
          customerId: clientId ?? undefined,
          bankAccountId,
          cashFlowArticleId: articleId || undefined,
          amount,
          currency,
          rateEur,
          iban: iban.trim() || undefined,
          purpose: purpose.trim() || undefined,
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

  function onClientPicked(
    id: string | null,
    _summary: ClientPickerItem | null,
  ): void {
    setClientId(id);
  }

  return (
    <div className="space-y-4">
      {autosave.restoreData && (
        <RestoreDraftBanner
          onRestore={() =>
            applyRestore(autosave.restoreData as BankPaymentDraftData)
          }
          onDismiss={autosave.dismissRestore}
        />
      )}

      <Section title={isOutgoing ? "Отримувач" : "Платник"}>
        <ClientPicker value={clientId} onChange={onClientPicked} />
        <p className="mt-1 text-xs text-gray-500">
          Необов'язково. {isOutgoing ? "Постачальник/отримувач" : "Клієнт"} для
          звірки.
        </p>
      </Section>

      <Section title="Реквізити">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Рахунок L-TEX">
            <select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">— Виберіть рахунок —</option>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={isOutgoing ? "Стаття (обов'язково)" : "Стаття руху коштів"}
          >
            <select
              value={articleId}
              onChange={(e) => setArticleId(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">— Виберіть статтю —</option>
              {articles.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code ? `${a.code} · ${a.name}` : a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="IBAN">
            <Input
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder="UA…"
            />
          </Field>
          <Field label="Призначення платежу">
            <Input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Оплата за товар…"
            />
          </Field>
        </div>
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
          Сума документа: {amount.toFixed(2)} {currencySymbol(currency)} ·
          зведено:{" "}
          <span className="font-semibold">{amountEur.toFixed(2)} €</span>
        </p>
        {rateEur <= 0 && (
          <p className="mt-1 text-sm text-red-600">
            Курс має бути більший за 0.
          </p>
        )}
      </Section>

      <Section title="Коментар">
        <Field label="Коментар">
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="—"
          />
        </Field>
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
