"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Textarea,
  useToast,
} from "@ltex/ui";
import { Scale } from "lucide-react";

export function ClientDebtCorrectionButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"increase" | "decrease">(
    "increase",
  );
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setAmount("");
    setDirection("increase");
    setNote("");
    setError(null);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function submit() {
    setError(null);
    const amountEur = Number(amount.replace(",", "."));
    if (!Number.isFinite(amountEur) || amountEur === 0) {
      setError("Вкажіть суму, відмінну від 0");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/v1/manager/clients/${clientId}/debt-correction`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            amountEur: Math.abs(amountEur),
            direction,
            note: note.trim() === "" ? null : note.trim(),
          }),
        },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setError(err.error ?? "Помилка збереження");
        return;
      }
      toast({ description: "Борг скориговано" });
      setOpen(false);
      reset();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" type="button" className="gap-2">
          <Scale className="h-4 w-4" />
          Корекція боргу
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Корекція боргу</DialogTitle>
          <DialogDescription>
            Створює рух боргу та перераховує поточний залишок.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label
              htmlFor="debt-correction-amount"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Сума, €
            </label>
            <input
              id="debt-correction-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
              placeholder="0.00"
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium text-gray-700">
              Напрям
            </legend>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="debt-direction"
                value="increase"
                checked={direction === "increase"}
                onChange={() => setDirection("increase")}
              />
              Збільшити борг
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="debt-direction"
                value="decrease"
                checked={direction === "decrease"}
                onChange={() => setDirection("decrease")}
              />
              Зменшити борг (списання)
            </label>
          </fieldset>

          <div>
            <label
              htmlFor="debt-correction-note"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Примітка
            </label>
            <Textarea
              id="debt-correction-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Підстава корекції (необов'язково)"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Скасувати
          </Button>
          <Button type="button" onClick={submit} disabled={submitting}>
            {submitting ? "Збереження…" : "Зберегти"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
