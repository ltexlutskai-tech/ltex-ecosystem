"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Textarea } from "@ltex/ui";
import { ClientPicker } from "./client-picker";
import { ItemsEditor, emptyDraft } from "./items-editor";
import { OrderTotals } from "./order-totals";
import {
  draftToWire,
  type ClientPickerItem,
  type OrderItemDraft,
} from "./types";

export interface OrderFormProps {
  initialClientId?: string | null;
  initialClient?: ClientPickerItem | null;
  exchangeRate: number;
}

export function OrderForm({
  initialClientId,
  initialClient,
  exchangeRate,
}: OrderFormProps) {
  const router = useRouter();
  const [clientId, setClientId] = useState<string | null>(
    initialClientId ?? null,
  );
  const [clientSummary, setClientSummary] = useState<ClientPickerItem | null>(
    initialClient ?? null,
  );
  const [items, setItems] = useState<OrderItemDraft[]>([emptyDraft()]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wireItems = items
    .map(draftToWire)
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const itemsInvalid = wireItems.some(
    (i) => !i.productId || i.weight <= 0 || i.quantity <= 0,
  );
  const canSubmit =
    !!clientId && wireItems.length > 0 && !itemsInvalid && !submitting;

  async function submit(): Promise<void> {
    if (!clientId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/manager/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: clientId,
          items: wireItems,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(errBody.error ?? `Помилка ${res.status}`);
        return;
      }
      const order = (await res.json()) as { id: string };
      router.push(`/manager/orders/${order.id}`);
    } catch (e) {
      setError((e as Error).message ?? "Невідома помилка");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <ClientPicker
        value={clientId}
        onChange={(id, summary) => {
          setClientId(id);
          setClientSummary(summary);
        }}
        initialSummary={clientSummary}
      />

      <ItemsEditor items={items} onChange={setItems} />

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Коментар
        </label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Будь-які примітки до замовлення (необов'язково)"
          rows={3}
          maxLength={2000}
        />
      </div>

      <OrderTotals items={items} exchangeRate={exchangeRate} />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/manager/orders")}
          disabled={submitting}
        >
          Скасувати
        </Button>
        <Button
          type="button"
          disabled={!canSubmit}
          onClick={submit}
          className="bg-green-600 text-white hover:bg-green-700"
        >
          {submitting ? "Створення…" : "Створити замовлення"}
        </Button>
      </div>
    </div>
  );
}
