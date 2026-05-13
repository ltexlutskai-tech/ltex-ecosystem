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
  Input,
  useToast,
} from "@ltex/ui";

export function DashboardCurrencyEditModal({
  open,
  onOpenChange,
  eur,
  usd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eur: number | null;
  usd: number | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [eurValue, setEurValue] = useState<string>(
    eur != null ? String(eur) : "",
  );
  const [usdValue, setUsdValue] = useState<string>(
    usd != null ? String(usd) : "",
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const eurNum = Number(eurValue);
    const usdNum = Number(usdValue);
    if (
      !Number.isFinite(eurNum) ||
      eurNum <= 0 ||
      !Number.isFinite(usdNum) ||
      usdNum <= 0
    ) {
      toast({
        title: "Невірні значення",
        description: "Курси мають бути додатніми числами.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/manager/admin/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ EUR: eurNum, USD: usdNum }),
      });
      if (res.ok) {
        toast({ title: "Курси оновлено" });
        onOpenChange(false);
        router.refresh();
      } else if (res.status === 403) {
        toast({
          title: "Недостатньо прав",
          variant: "destructive",
        });
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          title: data.error ?? "Не вдалося оновити курси",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Помилка з'єднання", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Курси валют</DialogTitle>
          <DialogDescription>
            Поки що зміна зберігається лише на сайті. Запис назад у 1С — у
            наступних оновленнях.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="rate-eur"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              EUR → UAH
            </label>
            <Input
              id="rate-eur"
              type="number"
              step="0.01"
              min="0"
              value={eurValue}
              onChange={(e) => setEurValue(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div>
            <label
              htmlFor="rate-usd"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              USD → UAH
            </label>
            <Input
              id="rate-usd"
              type="number"
              step="0.01"
              min="0"
              value={usdValue}
              onChange={(e) => setUsdValue(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Скасувати
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Збереження..." : "Зберегти"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
