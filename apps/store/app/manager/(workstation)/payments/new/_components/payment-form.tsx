"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, useToast } from "@ltex/ui";
import {
  reduceToEur,
  reduceChangeToEur,
  computeBalanceEur,
  computePaymentRecommendations,
  computeChangeRecommendations,
  PAYMENT_REMAINDER_DISCOUNT_THRESHOLD_EUR,
  type CashRates,
} from "@/lib/manager/cash-order";
import type { CashFlowDirection } from "@/lib/validations/manager-cash-order";
import { buildPaymentReceiptText } from "@/lib/manager/payment-message";
import { useDocumentAutosave } from "@/lib/autosave/use-document-autosave";
import {
  AutosaveStatus,
  RestoreDraftBanner,
} from "../../../_components/autosave-status";
import { ClientPicker } from "../../../orders/new/_components/client-picker";
import type { ClientPickerItem } from "../../../orders/new/_components/types";
import { ShareSheet } from "../../../prices/_components/share-sheet";
import { ArticleCombobox } from "./article-combobox";

/**
 * Серіалізований знімок стану payment-форми — джерело як для локальної копії
 * (рівень 1 localStorage), так і для серверної чернетки (рівень 2). JSON-safe.
 */
interface PaymentDraftData {
  direction: CashFlowDirection;
  clientId: string | null;
  clientLabel: string | null;
  clientBalanceEur: number;
  sumToPayRaw: string;
  includeDebt: boolean;
  rateEurRaw: string;
  rateUsdRaw: string;
  payUahRaw: string;
  payCashlessRaw: string;
  payEurRaw: string;
  payUsdRaw: string;
  changeUahRaw: string;
  changeEurRaw: string;
  changeUsdRaw: string;
  bankAccountId: string;
  cashFlowArticleId: string;
  comment: string;
}

/** Довідник банк. рахунків (з GET /dictionaries). */
export interface BankAccountOption {
  id: string;
  name: string;
  hiddenInApp: boolean;
}

/** Стаття руху коштів (з GET /dictionaries). */
export interface CashFlowArticleOption {
  id: string;
  code: string | null;
  name: string;
  parentId: string | null;
  /** "income" | "expense" | "both" — напрям, для фільтра за видом руху. */
  direction: string;
}

export type PaymentFormMode = "sale" | "client" | "standalone";

export interface PaymentFormProps {
  mode: PaymentFormMode;
  /** Реалізація-підстава (режим `sale`). */
  saleId?: string | null;
  /** Клієнт (MgrClient.id) preset (режим `client`). */
  clientId?: string | null;
  /** «До оплати» (EUR) — preset з реалізації або боргу клієнта. */
  presetSumToPayEur?: number | null;
  /** Курс EUR (грн за €) — знімок. */
  presetRateEur: number;
  /** Курс USD (грн за $) — знімок. */
  presetRateUsd: number;
  /** Лейбл клієнта для read-only показу (коли preset). */
  clientLabel?: string | null;
  /** Борг клієнта (EUR) — для «Включити суму боргу». */
  clientDebtEur?: number | null;
  /**
   * Знаковий баланс клієнта (EUR): >0 — клієнт винен (борг), <0 — переплата
   * (кредит). Дозволяє зарахувати попередній борг/переплату у фактичну оплату
   * (напр. для оплати на основі реалізації). Коли переданий — переважає над
   * `clientDebtEur` (який лише додатний).
   */
  clientBalanceEur?: number | null;
  bankAccounts: BankAccountOption[];
  cashFlowArticles: CashFlowArticleOption[];
  /** Роль користувача — для приховування лімітованих рахунків від менеджерів. */
  userRole: string;
  /** Куди повертатись після створення (за замовч. `/manager/payments`). */
  returnHref?: string | null;
  /**
   * Зворотне посилання на Маршрутний лист — коли оплату створюють зсередини МЛ.
   * Передається у POST як `routeSheetId`.
   */
  routeSheetId?: string | null;
}

const INPUT_CLASS =
  "h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500";

function eur(n: number): string {
  return `${n.toFixed(2)} €`;
}

function uahDisplay(n: number): string {
  return `${Math.round(n).toLocaleString("uk-UA")} ₴`;
}

/** Парсить рядок з комою/крапкою у невід'ємне число (0 коли невалідно). */
function parseAmount(raw: string): number {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Парсить курс (positive; 0 коли невалідно). */
function parseRate(raw: string): number {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Блок «Оплати / Каса» — Етап 2. Payment-форма (порт 1С обробки «Оплата»,
 * `docs/PAYMENTS_BLOCK_AUDIT.md` §A/§B). Повносторінкова (не модалка):
 * Вид руху (Приход/Расход) + клієнт/реалізація + 4 канали оплати + ручна
 * решта у 3 валютах + банк. рахунок (при безналі) + стаття (при Расход) +
 * live-підсумки Оплата/Решта/Залишок (EUR). EUR-base зведення.
 */
export function PaymentForm({
  mode,
  saleId,
  clientId,
  presetSumToPayEur,
  presetRateEur,
  presetRateUsd,
  clientLabel,
  clientDebtEur,
  clientBalanceEur,
  bankAccounts,
  cashFlowArticles,
  userRole,
  returnHref,
  routeSheetId,
}: PaymentFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const isManagerRole = userRole !== "admin" && userRole !== "owner";

  // Оплата на основі реалізації: тільки Прихід + стаття «Оплата від покупця»
  // (без вибору — виключає можливість помилки, рішення user).
  const lockSaleIncome = mode === "sale";

  // Дефолтна прихідна стаття для менеджера («Оплата від покупця» — за назвою).
  const defaultIncomeArticleId = useMemo(() => {
    const match = cashFlowArticles.find(
      (a) =>
        (a.direction === "income" || a.direction === "both") &&
        /покупц|покупател/i.test(a.name),
    );
    return match?.id ?? "";
  }, [cashFlowArticles]);

  // Прихід від контрагента: лише дві статті на вибір — «Оплата від покупця»
  // або «Оплата доставки» (рішення user 2026-07-14 — виключає помилковий вибір).
  const isIncomeClientArticle = useCallback(
    (a: CashFlowArticleOption): boolean =>
      /покупц|покупател/i.test(a.name) || /доставк/i.test(a.name),
    [],
  );

  // ─── Вид руху ───────────────────────────────────────────────────────────
  const [direction, setDirection] = useState<CashFlowDirection>("income");

  // ─── Клієнт (для standalone/client без preset — через picker) ─────────────
  const [pickedClientId, setPickedClientId] = useState<string | null>(
    clientId ?? null,
  );
  const [pickedClientLabel, setPickedClientLabel] = useState<string | null>(
    clientLabel ?? null,
  );
  // Баланс обраного клієнта (EUR, знаковий): >0 — борг, <0 — переплата (кредит).
  const [pickedClientBalanceEur, setPickedClientBalanceEur] = useState<number>(
    clientBalanceEur ?? clientDebtEur ?? 0,
  );

  const needsClientPicker = mode === "standalone" && !saleId && !clientId;

  // ─── До оплати + борг ─────────────────────────────────────────────────────
  const initialSumToPay = presetSumToPayEur ?? clientDebtEur ?? 0;
  const [sumToPayRaw, setSumToPayRaw] = useState(
    initialSumToPay > 0 ? String(initialSumToPay) : "",
  );
  const [includeDebt, setIncludeDebt] = useState(false);

  // ─── Курси (згорнута секція) ──────────────────────────────────────────────
  const [ratesOpen, setRatesOpen] = useState(false);
  const [rateEurRaw, setRateEurRaw] = useState(String(presetRateEur || ""));
  const [rateUsdRaw, setRateUsdRaw] = useState(String(presetRateUsd || ""));

  // ─── 4 канали оплати ──────────────────────────────────────────────────────
  const [payUahRaw, setPayUahRaw] = useState("");
  const [payCashlessRaw, setPayCashlessRaw] = useState("");
  const [payEurRaw, setPayEurRaw] = useState("");
  const [payUsdRaw, setPayUsdRaw] = useState("");

  // ─── Решта (здача) ────────────────────────────────────────────────────────
  const [changeUahRaw, setChangeUahRaw] = useState("");
  const [changeEurRaw, setChangeEurRaw] = useState("");
  const [changeUsdRaw, setChangeUsdRaw] = useState("");

  // ─── Банк. рахунок / стаття / коментар ────────────────────────────────────
  const [bankAccountId, setBankAccountId] = useState("");
  // Стаття руху коштів (обов'язкова). Менеджеру (та завжди для оплати на основі
  // реалізації) — дефолт «Оплата від покупця».
  const [cashFlowArticleId, setCashFlowArticleId] = useState(
    lockSaleIncome || isManagerRole ? defaultIncomeArticleId : "",
  );
  const [comment, setComment] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [discounting, setDiscounting] = useState(false);

  /**
   * Id збереженого документа: `null` доки чернетку ще не створено (нова оплата).
   * Оновлюється явним POST АБО autosave (`onIdAssigned`). Використовується у
   * `submit`: якщо є id → PATCH (перевикористати чернетку), інакше POST.
   */
  const [savedId, setSavedId] = useState<string | null>(null);

  // ─── Повідомлення (Viber/share квитанція) ─────────────────────────────────
  const [shareOpen, setShareOpen] = useState(false);
  const [shareText, setShareText] = useState("");

  const rates: CashRates = useMemo(
    () => ({ eur: parseRate(rateEurRaw), usd: parseRate(rateUsdRaw) }),
    [rateEurRaw, rateUsdRaw],
  );

  const isExpense = direction === "expense";

  // «До оплати» з урахуванням попереднього балансу клієнта (борг додається,
  // переплата віднімається; не менше 0).
  const baseSumToPay = parseAmount(sumToPayRaw);
  const sumToPayEur = useMemo(() => {
    const extra = includeDebt ? pickedClientBalanceEur : 0;
    return Math.max(0, Math.round((baseSumToPay + extra) * 100) / 100);
  }, [baseSumToPay, includeDebt, pickedClientBalanceEur]);

  const paid = useMemo(
    () => ({
      uah: parseAmount(payUahRaw),
      eur: parseAmount(payEurRaw),
      usd: parseAmount(payUsdRaw),
      uahCashless: parseAmount(payCashlessRaw),
    }),
    [payUahRaw, payEurRaw, payUsdRaw, payCashlessRaw],
  );

  const change = useMemo(
    () => ({
      uah: isExpense ? 0 : parseAmount(changeUahRaw),
      eur: isExpense ? 0 : parseAmount(changeEurRaw),
      usd: isExpense ? 0 : parseAmount(changeUsdRaw),
    }),
    [isExpense, changeUahRaw, changeEurRaw, changeUsdRaw],
  );

  const paidEur = useMemo(() => reduceToEur(paid, rates), [paid, rates]);
  const changeEur = useMemo(
    () => reduceChangeToEur(change, rates),
    [change, rates],
  );
  const balanceEur = useMemo(
    () => computeBalanceEur({ sumToPayEur, paidEur, changeEur }),
    [sumToPayEur, paidEur, changeEur],
  );

  const payRec = useMemo(
    () => computePaymentRecommendations({ sumToPayEur, paidEur, rates }),
    [sumToPayEur, paidEur, rates],
  );
  const changeRec = useMemo(
    () => computeChangeRecommendations({ balanceEur, rates }),
    [balanceEur, rates],
  );

  const totalPaid = paid.uah + paid.eur + paid.usd + paid.uahCashless;
  const showBankAccount = paid.uahCashless > 0;

  // Статті, доступні для поточного виду руху (income/expense + both).
  // При Приході з контрагентом — лише «Оплата від покупця» / «Оплата доставки».
  const articlesForDirection = useMemo(() => {
    const want = isExpense ? "expense" : "income";
    const byDirection = cashFlowArticles.filter(
      (a) => a.direction === "both" || a.direction === want,
    );
    if (isExpense) return byDirection;
    const restricted = byDirection.filter(isIncomeClientArticle);
    // Якщо у довіднику немає жодної з двох статей — не залишаємо порожній список
    // (краще показати всі прихідні, ніж заблокувати оплату).
    return restricted.length > 0 ? restricted : byDirection;
  }, [cashFlowArticles, isExpense, isIncomeClientArticle]);

  // Якщо обрана стаття не підходить під новий напрям — скидаємо (менеджеру на
  // Приході підставляємо дефолт «Оплата від покупця»).
  useEffect(() => {
    const stillValid = articlesForDirection.some(
      (a) => a.id === cashFlowArticleId,
    );
    if (!stillValid) {
      setCashFlowArticleId(
        !isExpense && (lockSaleIncome || isManagerRole)
          ? defaultIncomeArticleId
          : "",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articlesForDirection]);

  // Залишок: >0 борг, <0 переплата.
  const balanceLabel =
    balanceEur > 0
      ? "Залишок (борг)"
      : balanceEur < 0
        ? "Переплата (решта)"
        : "Сплачено повністю";

  // Кнопка «Дати знижку на залишок» — лише для реалізації + дрібний залишок.
  const canDiscount =
    Boolean(saleId) &&
    balanceEur !== 0 &&
    Math.abs(balanceEur) <= PAYMENT_REMAINDER_DISCOUNT_THRESHOLD_EUR;

  const effectiveClientId = saleId ? null : (pickedClientId ?? null);

  // Чи можна сабмітити: завжди — підстава (saleId/клієнт) + стаття руху коштів;
  // для income ще й сума оплати > 0.
  const hasBasis = Boolean(saleId) || Boolean(effectiveClientId);
  const canSubmit =
    !submitting &&
    hasBasis &&
    rates.eur > 0 &&
    rates.usd > 0 &&
    Boolean(cashFlowArticleId) &&
    (isExpense || totalPaid > 0);

  // ─── Автозбереження чернетки (наскрізне, План AUTOSAVE_REALTIME_PLAN) ──────
  // Дворівневий захист: рівень 1 (localStorage) + рівень 2 (жива чернетка в БД).
  // ⚠️ Грошова безпека: draft НЕ проводить оплату й НЕ рахує здачу/борг/ДДС —
  // пише лише один рядок MgrCashOrder зі status="draft" (`createCashOrderDraft`).
  const draftData = useMemo<PaymentDraftData>(
    () => ({
      direction,
      clientId: effectiveClientId,
      clientLabel: pickedClientLabel ?? clientLabel ?? null,
      clientBalanceEur: pickedClientBalanceEur,
      sumToPayRaw,
      includeDebt,
      rateEurRaw,
      rateUsdRaw,
      payUahRaw,
      payCashlessRaw,
      payEurRaw,
      payUsdRaw,
      changeUahRaw,
      changeEurRaw,
      changeUsdRaw,
      bankAccountId,
      cashFlowArticleId,
      comment,
    }),
    [
      direction,
      effectiveClientId,
      pickedClientLabel,
      clientLabel,
      pickedClientBalanceEur,
      sumToPayRaw,
      includeDebt,
      rateEurRaw,
      rateUsdRaw,
      payUahRaw,
      payCashlessRaw,
      payEurRaw,
      payUsdRaw,
      changeUahRaw,
      changeEurRaw,
      changeUsdRaw,
      bankAccountId,
      cashFlowArticleId,
      comment,
    ],
  );

  /** Тіло draft-запиту (спільне для POST/PATCH чернетки). */
  const draftBody = useCallback(
    (d: PaymentDraftData): Record<string, unknown> => ({
      draft: true,
      type: d.direction,
      amountUah: parseAmount(d.payUahRaw),
      amountEur: parseAmount(d.payEurRaw),
      amountUsd: parseAmount(d.payUsdRaw),
      amountUahCashless: parseAmount(d.payCashlessRaw),
      bankAccountId: d.bankAccountId || undefined,
      cashFlowArticleId: d.cashFlowArticleId || undefined,
      comment: d.comment.trim() || undefined,
      rateEur: parseRate(d.rateEurRaw),
      rateUsd: parseRate(d.rateUsdRaw),
    }),
    [],
  );

  const createDraftServer = useCallback(
    async (d: PaymentDraftData): Promise<string> => {
      const res = await fetch("/api/v1/manager/cash-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draftBody(d),
          saleId: saleId ?? undefined,
          clientId: saleId ? undefined : (d.clientId ?? undefined),
          ...(routeSheetId ? { routeSheetId } : {}),
        }),
      });
      if (!res.ok) throw new Error(`draft create ${res.status}`);
      const j = (await res.json()) as { id: string };
      return j.id;
    },
    [draftBody, saleId, routeSheetId],
  );

  const updateDraftServer = useCallback(
    async (id: string, d: PaymentDraftData): Promise<void> => {
      const res = await fetch(`/api/v1/manager/cash-orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftBody(d)),
      });
      if (!res.ok) throw new Error(`draft update ${res.status}`);
    },
    [draftBody],
  );

  const autosave = useDocumentAutosave<PaymentDraftData>({
    docType: "cash-order",
    existingId: null,
    data: draftData,
    // Серверна чернетка можлива лише коли є підстава (реалізація або клієнт).
    canCreateDraft: hasBasis,
    createDraft: createDraftServer,
    updateDraft: updateDraftServer,
    onIdAssigned: (id) => {
      setSavedId(id);
      window.history.replaceState(null, "", `/manager/payments/${id}`);
    },
  });

  /** Застосувати відновлені з localStorage дані у стан форми. */
  function applyRestore(d: PaymentDraftData): void {
    setDirection(d.direction);
    setPickedClientId(d.clientId);
    setPickedClientLabel(d.clientLabel);
    setPickedClientBalanceEur(d.clientBalanceEur);
    setSumToPayRaw(d.sumToPayRaw);
    setIncludeDebt(d.includeDebt);
    setRateEurRaw(d.rateEurRaw);
    setRateUsdRaw(d.rateUsdRaw);
    setPayUahRaw(d.payUahRaw);
    setPayCashlessRaw(d.payCashlessRaw);
    setPayEurRaw(d.payEurRaw);
    setPayUsdRaw(d.payUsdRaw);
    setChangeUahRaw(d.changeUahRaw);
    setChangeEurRaw(d.changeEurRaw);
    setChangeUsdRaw(d.changeUsdRaw);
    setBankAccountId(d.bankAccountId);
    setCashFlowArticleId(d.cashFlowArticleId);
    setComment(d.comment);
    autosave.acceptRestore();
  }

  function onClientPicked(
    id: string | null,
    summary: ClientPickerItem | null,
  ): void {
    setPickedClientId(id);
    setPickedClientLabel(summary?.name ?? null);
    if (!id) {
      setPickedClientBalanceEur(0);
      return;
    }
    // Підтягуємо баланс клієнта (знаковий: борг>0 / переплата<0) → дефолт «До
    // оплати».
    fetch(`/api/v1/manager/clients/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { client?: { debt?: string } } | null) => {
        const debt = json?.client?.debt ? Number(json.client.debt) : 0;
        const balance = Number.isFinite(debt) ? debt : 0;
        setPickedClientBalanceEur(balance);
        if (balance > 0 && !sumToPayRaw) {
          setSumToPayRaw(String(balance));
        }
      })
      .catch(() => {
        /* баланс — best-effort; форму це не блокує */
      });
  }

  async function submit(post: boolean): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // Гасимо чергу autosave, щоб відкладений draft-PATCH не перезаписав
      // проведений/збережений документ після цього запиту.
      autosave.clearAll();
      // Якщо autosave вже створив чернетку (`savedId`) — PATCH перевикористовує
      // її як ордер (реквізити безпечні: рухи ДДС/боргу лише при post). Інакше —
      // POST нового документа.
      const usePatch = savedId != null;
      const url = usePatch
        ? `/api/v1/manager/cash-orders/${savedId}`
        : "/api/v1/manager/cash-orders";
      const res = await fetch(url, {
        method: usePatch ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Підстава потрібна strict-схемі (refine saleId||clientId); при PATCH
          // сервер бере її з наявного рядка, але поле має бути присутнім.
          saleId: saleId ?? undefined,
          clientId: saleId ? undefined : (effectiveClientId ?? undefined),
          type: direction,
          amountUah: paid.uah,
          amountEur: paid.eur,
          amountUsd: paid.usd,
          amountUahCashless: paid.uahCashless,
          changeUah: change.uah,
          changeEur: change.eur,
          changeUsd: change.usd,
          bankAccountId: bankAccountId || undefined,
          cashFlowArticleId: cashFlowArticleId || undefined,
          comment: comment.trim() || undefined,
          post,
          rateEur: rates.eur,
          rateUsd: rates.usd,
          sumToPayEur,
          includeDebt,
          ...(usePatch ? {} : { routeSheetId: routeSheetId ?? undefined }),
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
      const j = (await res.json().catch(() => null)) as {
        income?: { id?: string };
      } | null;
      if (!usePatch && j?.income?.id) setSavedId(j.income.id);
      toast({ title: post ? "Оплату проведено" : "Чернетку збережено" });
      router.push(returnHref ?? "/manager/payments");
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

  async function discountRemainder(): Promise<void> {
    if (!saleId || !canDiscount) return;
    setDiscounting(true);
    try {
      const res = await fetch(
        "/api/v1/manager/cash-orders/discount-remainder",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            saleId,
            remainderEur: balanceEur,
            rateEur: rates.eur,
            rateUsd: rates.usd,
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          title: body.error ?? `Помилка ${res.status}`,
          variant: "destructive",
        });
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        totalEur?: number;
      };
      if (typeof body.totalEur === "number") {
        setSumToPayRaw(String(body.totalEur));
      }
      toast({ title: "Знижку на залишок нараховано" });
      router.refresh();
    } catch (e) {
      toast({
        title: (e as Error).message ?? "Невідома помилка",
        variant: "destructive",
      });
    } finally {
      setDiscounting(false);
    }
  }

  /** Відкриває ShareSheet з текстом-квитанцією, зібраним зі стану форми. */
  function openReceipt(): void {
    const acct = bankAccounts.find((a) => a.id === bankAccountId)?.name ?? null;
    const codAmountUah = balanceEur > 0 ? balanceEur * rates.eur : null;
    setShareText(
      buildPaymentReceiptText({
        clientName: pickedClientLabel ?? clientLabel ?? "",
        type: direction,
        paid: {
          uah: paid.uah,
          eur: paid.eur,
          usd: paid.usd,
          uahCashless: paid.uahCashless,
        },
        change: { uah: change.uah, eur: change.eur, usd: change.usd },
        bankAccountName: acct,
        paymentPurpose: paid.uahCashless > 0 ? "Оплата товару" : null,
        rates: { eur: rates.eur, usd: rates.usd },
        sumToPayEur,
        cashOnDelivery: codAmountUah !== null,
        codAmountUah,
      }),
    );
    setShareOpen(true);
  }

  // Банк. рахунки: при Розході видно всі; при Приході рахунок з лімітом
  // (`hiddenInApp`) приховано ЛИШЕ для менеджерів (адмін/власник бачать).
  const visibleAccounts = bankAccounts.filter(
    (a) => isExpense || !a.hiddenInApp || !isManagerRole,
  );
  const hasHiddenAccounts =
    !isExpense && isManagerRole && bankAccounts.some((a) => a.hiddenInApp);

  return (
    <div className="space-y-4">
      {autosave.restoreData && (
        <RestoreDraftBanner
          onRestore={() =>
            applyRestore(autosave.restoreData as PaymentDraftData)
          }
          onDismiss={autosave.dismissRestore}
        />
      )}

      {/* ─── Вид руху ──────────────────────────────────────────────────── */}
      <Section title="Вид руху коштів">
        {lockSaleIncome ? (
          <div className="inline-flex items-center rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
            Прихід · Оплата від покупця
          </div>
        ) : (
          <div
            role="radiogroup"
            aria-label="Вид руху коштів"
            className="inline-flex overflow-hidden rounded-md border border-gray-300"
            onKeyDown={(e) => {
              // Стрілки перемикають вид руху (навігація без миші).
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                setDirection("expense");
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                setDirection("income");
              }
            }}
          >
            <button
              type="button"
              role="radio"
              aria-checked={!isExpense}
              tabIndex={!isExpense ? 0 : -1}
              onClick={() => setDirection("income")}
              className={`px-4 py-2 text-sm font-medium ${
                !isExpense
                  ? "bg-green-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              Прихід
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={isExpense}
              tabIndex={isExpense ? 0 : -1}
              onClick={() => setDirection("expense")}
              className={`px-4 py-2 text-sm font-medium ${
                isExpense
                  ? "bg-red-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              Розхід
            </button>
          </div>
        )}
      </Section>

      {/* ─── Стаття руху коштів (одразу після виду руху, рішення user) ────── */}
      <Section title="Стаття руху коштів">
        {lockSaleIncome ? (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            Оплата від покупця
            {!cashFlowArticleId && (
              <span className="ml-2 text-xs text-amber-600">
                (у довіднику немає статті «Оплата від покупця» — додайте її)
              </span>
            )}
          </div>
        ) : (
          <>
            <Field label="Стаття (обов'язково)">
              <ArticleCombobox
                items={articlesForDirection}
                value={cashFlowArticleId}
                onChange={setCashFlowArticleId}
              />
            </Field>
            {!cashFlowArticleId && (
              <p className="mt-1 text-xs text-amber-600">
                Оберіть статтю руху коштів.
              </p>
            )}
          </>
        )}
      </Section>

      {/* ─── Клієнт ────────────────────────────────────────────────────── */}
      <Section title="Клієнт / підстава">
        {needsClientPicker ? (
          <ClientPicker value={pickedClientId} onChange={onClientPicked} />
        ) : (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            {saleId ? "Реалізація: " : "Клієнт: "}
            <span className="font-medium text-gray-900">
              {pickedClientLabel ?? clientLabel ?? "—"}
            </span>
          </div>
        )}
      </Section>

      {/* ─── До оплати ─────────────────────────────────────────────────── */}
      <Section title="До оплати">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Сума до оплати, €">
            <Input
              inputMode="decimal"
              value={sumToPayRaw}
              onChange={(e) => setSumToPayRaw(e.target.value)}
              placeholder="0"
            />
          </Field>
          {(saleId || effectiveClientId) && pickedClientBalanceEur !== 0 && (
            <label className="flex items-end gap-2 pb-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={includeDebt}
                onChange={(e) => setIncludeDebt(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span>
                {pickedClientBalanceEur > 0
                  ? `Додати попередній борг (+${eur(pickedClientBalanceEur)})`
                  : `Зарахувати переплату (−${eur(
                      Math.abs(pickedClientBalanceEur),
                    )})`}
              </span>
            </label>
          )}
        </div>
      </Section>

      {/* ─── Курси (згорнуто) ──────────────────────────────────────────── */}
      <Section title="Курси валют">
        <button
          type="button"
          onClick={() => setRatesOpen((v) => !v)}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          {ratesOpen ? "Згорнути" : "Показати/змінити курси"}
        </button>
        {ratesOpen && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Курс EUR (грн за €)">
              <Input
                inputMode="decimal"
                value={rateEurRaw}
                onChange={(e) => setRateEurRaw(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label="Курс USD (грн за $)">
              <Input
                inputMode="decimal"
                value={rateUsdRaw}
                onChange={(e) => setRateUsdRaw(e.target.value)}
                placeholder="0"
              />
            </Field>
          </div>
        )}
        {(rates.eur <= 0 || rates.usd <= 0) && (
          <p className="mt-2 text-sm text-red-600">
            Курси EUR та USD мають бути більші за 0.
          </p>
        )}
      </Section>

      {/* ─── Канали оплати ─────────────────────────────────────────────── */}
      <Section title="Оплата">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            label="Готівка, грн"
            hint={payRec.payUah > 0 ? `≈ ${uahDisplay(payRec.payUah)}` : null}
          >
            <Input
              inputMode="decimal"
              value={payUahRaw}
              onChange={(e) => setPayUahRaw(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Безготівка, грн">
            <Input
              inputMode="decimal"
              value={payCashlessRaw}
              onChange={(e) => setPayCashlessRaw(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field
            label="Готівка, EUR"
            hint={payRec.payEur > 0 ? `≈ ${eur(payRec.payEur)}` : null}
          >
            <Input
              inputMode="decimal"
              value={payEurRaw}
              onChange={(e) => setPayEurRaw(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field
            label="Готівка, USD"
            hint={payRec.payUsd > 0 ? `≈ ${payRec.payUsd.toFixed(2)} $` : null}
          >
            <Input
              inputMode="decimal"
              value={payUsdRaw}
              onChange={(e) => setPayUsdRaw(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>

        {showBankAccount && (
          <div className="mt-3">
            <Field label="Банк. рахунок">
              <select
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">— Виберіть рахунок —</option>
                {visibleAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            {hasHiddenAccounts && (
              <p className="mt-1 text-xs text-gray-500">
                Частина рахунків прихована для менеджерів при приході (ліміт).
              </p>
            )}
          </div>
        )}
      </Section>

      {/* ─── Решта (здача) — лише прихід ───────────────────────────────── */}
      {!isExpense && (
        <Section title="Решта (здача)">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field
              label="Решта, грн"
              hint={
                changeRec.changeUah > 0
                  ? `≈ ${uahDisplay(changeRec.changeUah)}`
                  : null
              }
            >
              <Input
                inputMode="decimal"
                value={changeUahRaw}
                onChange={(e) => setChangeUahRaw(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field
              label="Решта, EUR"
              hint={
                changeRec.changeEur > 0 ? `≈ ${eur(changeRec.changeEur)}` : null
              }
            >
              <Input
                inputMode="decimal"
                value={changeEurRaw}
                onChange={(e) => setChangeEurRaw(e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field
              label="Решта, USD"
              hint={
                changeRec.changeUsd > 0
                  ? `≈ ${changeRec.changeUsd.toFixed(2)} $`
                  : null
              }
            >
              <Input
                inputMode="decimal"
                value={changeUsdRaw}
                onChange={(e) => setChangeUsdRaw(e.target.value)}
                placeholder="0"
              />
            </Field>
          </div>
        </Section>
      )}

      {/* ─── Коментар ──────────────────────────────────────────────────── */}
      <Section title="Коментар">
        <Field label="Коментар">
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="—"
          />
        </Field>
      </Section>

      {/* ─── Підсумок ──────────────────────────────────────────────────── */}
      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-gray-800">Підсумок</h2>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <SummaryTile
            label="Оплата (EUR)"
            valueEur={paidEur}
            valueUah={paidEur * rates.eur}
          />
          {!isExpense && (
            <SummaryTile
              label="Решта (EUR)"
              valueEur={changeEur}
              valueUah={changeEur * rates.eur}
            />
          )}
          <div
            className={`min-w-0 rounded-md border px-3 py-2 ${
              balanceEur > 0
                ? "border-amber-200 bg-amber-50"
                : balanceEur < 0
                  ? "border-blue-200 bg-blue-50"
                  : "border-green-200 bg-green-50"
            }`}
          >
            <dt className="text-xs uppercase tracking-wide text-gray-400">
              {balanceLabel}
            </dt>
            <dd className="mt-0.5 font-semibold text-gray-900">
              {eur(Math.abs(balanceEur))}
            </dd>
            <dd className="text-xs text-gray-500">
              {uahDisplay(Math.abs(balanceEur) * rates.eur)}
            </dd>
          </div>
        </dl>
      </section>

      {/* ─── Кнопки ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <AutosaveStatus
          status={autosave.status}
          savedAt={autosave.savedAt}
          className="mr-auto"
        />
        {canDiscount && (
          <Button
            type="button"
            variant="outline"
            disabled={discounting}
            onClick={discountRemainder}
          >
            {discounting ? "Нарахування…" : "Дати знижку на залишок"}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={openReceipt}>
          Вайбер
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!canSubmit}
          onClick={() => submit(false)}
        >
          {submitting ? "Збереження…" : "Зберегти"}
        </Button>
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={() => submit(true)}
        >
          {submitting ? "Проведення…" : "Провести"}
        </Button>
      </div>

      <ShareSheet
        open={shareOpen}
        onOpenChange={setShareOpen}
        title="Квитанція оплати"
        text={shareText}
      />
    </div>
  );
}

function SummaryTile({
  label,
  valueEur,
  valueUah,
}: {
  label: string;
  valueEur: number;
  valueUah: number;
}) {
  return (
    <div className="min-w-0 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-0.5 font-semibold text-gray-900">{eur(valueEur)}</dd>
      <dd className="text-xs text-gray-500">{uahDisplay(valueUah)}</dd>
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
  hint,
  children,
}: {
  label: string;
  hint?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        {hint ? (
          <span className="text-xs font-medium text-green-700">{hint}</span>
        ) : null}
      </span>
      {children}
    </label>
  );
}
