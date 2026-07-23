"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, useToast } from "@ltex/ui";
import { usePortalConfirm } from "../../../_components/use-portal-confirm";
import { BarcodeInput } from "../../../sales/new/_components/barcode-input";
import { videoTaskStatusMeta } from "@/lib/manager/video-task-status";

export interface AttrOption {
  value: string;
  label: string;
}

export interface VideoBagView {
  id: string;
  status: string;
  barcode: string | null;
  weight: number | null;
  unitsCount: string | null;
  unitWeight: string | null;
  lotWeightKg: number | null;
  videoUrl: string | null;
  youtubeDescription: string | null;
}

export interface VideoTaskView {
  id: string;
  status: string;
  managerName: string | null;
  clientName: string | null;
  productName: string;
  articleCode: string | null;
  quantity: number;
  requestedBarcode: string | null;
  assignedName: string | null;
  season: string | null;
  quality: string | null;
  gender: string | null;
  sizes: string | null;
  completedAt: string | null;
  bags: VideoBagView[];
}

const FILM_ROLES = ["videozone", "admin", "owner"];
const BRING_ROLES = ["warehouse", "admin", "owner"];

export function VideoTaskDetail({
  task,
  role,
  seasonOptions,
  qualityOptions,
  genderOptions,
}: {
  task: VideoTaskView;
  role: string;
  seasonOptions: AttrOption[];
  qualityOptions: AttrOption[];
  genderOptions: AttrOption[];
}) {
  const router = useRouter();
  const meta = videoTaskStatusMeta(task);
  // Відеозона не бачить клієнта — лише артикул, назву товару та менеджера.
  const hideClient = role === "videozone";

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-gray-900">
            {task.productName}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {!hideClient ? (
              <>
                Клієнт:{" "}
                <span className="font-medium">{task.clientName ?? "—"}</span>{" "}
                ·{" "}
              </>
            ) : null}
            {task.quantity} міш.
            {task.articleCode ? ` · арт. ${task.articleCode}` : ""}
            {task.managerName ? ` · менеджер: ${task.managerName}` : ""}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${meta.cls}`}
        >
          {meta.label}
        </span>
      </div>

      {task.status === "new" && BRING_ROLES.includes(role) ? (
        <CollectSection task={task} />
      ) : null}

      {task.status === "filming" && FILM_ROLES.includes(role) ? (
        <FilmSection
          task={task}
          seasonOptions={seasonOptions}
          qualityOptions={qualityOptions}
          genderOptions={genderOptions}
        />
      ) : null}

      {task.status === "done" ? <DoneSection task={task} /> : null}

      {task.status !== "done" &&
      !(task.status === "new" && BRING_ROLES.includes(role)) &&
      !(task.status === "filming" && FILM_ROLES.includes(role)) ? (
        <div className="rounded-md border border-dashed p-6 text-sm text-gray-500">
          <p className="text-center">
            {task.status === "new"
              ? "Очікуємо, поки склад збере й принесе мішки."
              : "Завдання на зйомці у відеозоні."}
          </p>
          {task.bags.length > 0 ? (
            <ul className="mx-auto mt-3 max-w-sm space-y-1">
              {task.bags.map((b) => (
                <li key={b.id} className="flex justify-between font-mono">
                  <span>{b.barcode}</span>
                  <span>
                    {b.videoUrl
                      ? "🎬 відео є"
                      : b.status === "done"
                        ? "готово"
                        : "очікує"}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => router.push("/manager/video-tasks")}
        >
          ← До списку
        </Button>
      </div>
    </>
  );
}

/**
 * Крок складу: сканує по одному ШК на кожен мішок (камера/сканер). Може
 * видалити зайвий рядок (мішок не несуть на відео з якоїсь причини) — тоді
 * бронь з нього знімається, а планова к-сть зменшується. «Передати у відеозону»
 * активна, коли є хоча б один мішок.
 */
function CollectSection({ task }: { task: VideoTaskView }) {
  const router = useRouter();
  const { toast } = useToast();
  const { confirm, dialog } = usePortalConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scanned = task.bags.length;
  const remaining = Math.max(0, task.quantity - scanned);

  async function addBag(code: string) {
    const barcode = code.trim();
    if (!barcode || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/manager/video-tasks/${task.id}/bring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        barcode?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Не вдалося");
        toast({ title: data.error ?? "Не вдалося", variant: "destructive" });
        return;
      }
      toast({
        title: `Мішок ${data.barcode ?? barcode} додано (заброньовано)`,
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeBag(bagId: string, barcode: string | null) {
    confirm({
      title: "Прибрати мішок?",
      message: `Мішок ${barcode ?? ""} не понесуть на відео — бронь буде знято.`,
      destructive: true,
      confirmLabel: "Прибрати",
      cancelLabel: "Ні",
      onConfirm: async () => {
        const res = await fetch(
          `/api/v1/manager/video-tasks/${task.id}/bags/${bagId}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          toast({ title: data.error ?? "Не вдалося", variant: "destructive" });
          return;
        }
        toast({ title: "Мішок прибрано, бронь знято" });
        router.refresh();
      },
    });
  }

  async function advance() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v1/manager/video-tasks/${task.id}/advance`,
        {
          method: "POST",
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast({ title: data.error ?? "Не вдалося", variant: "destructive" });
        return;
      }
      toast({ title: "Мішки передано у відеозону" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border bg-white p-4">
      <p className="text-sm text-gray-600">
        Візьміть{" "}
        {task.quantity > 1
          ? `${task.quantity} вільних мішки(ів)`
          : "вільний мішок"}{" "}
        цього товару і відскануйте штрихкод кожного (камерою чи сканером). Кожен
        відсканований мішок одразу бронюється на клієнта.
      </p>

      {task.requestedBarcode ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-50 p-2 text-sm">
          <span>
            Менеджер просив конкретний мішок:{" "}
            <span className="font-mono">{task.requestedBarcode}</span>
          </span>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => addBag(task.requestedBarcode!)}
          >
            Додати цей мішок
          </Button>
        </div>
      ) : null}

      {task.bags.length > 0 ? (
        <ul className="space-y-1">
          {task.bags.map((b, i) => (
            <li
              key={b.id}
              className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm"
            >
              <span>
                <span className="mr-2 text-gray-400">{i + 1}.</span>
                <span className="font-mono">{b.barcode}</span>
                {b.weight != null ? (
                  <span className="ml-2 text-gray-500">{b.weight} кг</span>
                ) : null}
              </span>
              <button
                type="button"
                className="text-xs text-red-600 hover:underline"
                onClick={() => removeBag(b.id, b.barcode)}
              >
                Прибрати
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="text-sm text-gray-500">
        Відскановано {scanned} з {task.quantity}
        {remaining > 0 ? ` — ще ${remaining}` : " ✓"}
      </div>

      {remaining > 0 ? (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Штрихкод мішка №{scanned + 1}
          </label>
          <BarcodeInput onCode={addBag} error={error} disabled={busy} />
        </div>
      ) : null}

      <div className="border-t pt-3">
        <Button
          type="button"
          disabled={busy || scanned === 0}
          onClick={advance}
        >
          Передати у відеозону ({scanned} міш.)
        </Button>
        {scanned < task.quantity && scanned > 0 ? (
          <p className="mt-1 text-xs text-gray-500">
            Можна передати й менше, ніж просили — планова кількість зміниться на{" "}
            {scanned}.
          </p>
        ) : null}
      </div>
      {dialog}
    </div>
  );
}

/** Селект характеристики з довідника (сезон/сорт/стать). */
function AttrField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: AttrOption[];
  onChange: (v: string) => void;
}) {
  const known = options.some((o) => o.value === value);
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
      >
        <option value="">— не вказано —</option>
        {!known && value ? <option value={value}>{value}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Крок відеозони: спільні характеристики (довідники) + по кожному мішку —
 * вага/к-сть/відео/опис. «Готово» активне, коли КОЖЕН мішок має опис.
 */
function FilmSection({
  task,
  seasonOptions,
  qualityOptions,
  genderOptions,
}: {
  task: VideoTaskView;
  seasonOptions: AttrOption[];
  qualityOptions: AttrOption[];
  genderOptions: AttrOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [shared, setShared] = useState({
    season: task.season ?? "",
    quality: task.quality ?? "",
    gender: task.gender ?? "",
    sizes: task.sizes ?? "",
  });
  const [savingShared, setSavingShared] = useState(false);
  const [finishing, setFinishing] = useState(false);
  // Лічильник описів (локальний стан з бекенду через bags props).
  const [described, setDescribed] = useState<Set<string>>(
    new Set(
      task.bags.filter((b) => b.youtubeDescription?.trim()).map((b) => b.id),
    ),
  );

  const allDescribed =
    task.bags.length > 0 && task.bags.every((b) => described.has(b.id));

  const setS = (k: keyof typeof shared) => (v: string) =>
    setShared((f) => ({ ...f, [k]: v }));

  async function saveShared(): Promise<boolean> {
    setSavingShared(true);
    try {
      const res = await fetch(`/api/v1/manager/video-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shared),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          title: data.error ?? "Не вдалося зберегти",
          variant: "destructive",
        });
        return false;
      }
      return true;
    } finally {
      setSavingShared(false);
    }
  }

  async function finish() {
    setFinishing(true);
    try {
      const res = await fetch(`/api/v1/manager/video-tasks/${task.id}/done`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          title: data.error ?? "Не вдалося завершити",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Готово! Лоти заброньовано, менеджеру надіслано сповіщення.",
      });
      router.push("/manager/video-tasks");
      router.refresh();
    } finally {
      setFinishing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-md border bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-800">
          Спільні характеристики (для всіх мішків)
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <AttrField
            label="Сезон"
            value={shared.season}
            options={seasonOptions}
            onChange={setS("season")}
          />
          <AttrField
            label="Сорт"
            value={shared.quality}
            options={qualityOptions}
            onChange={setS("quality")}
          />
          <AttrField
            label="Стать"
            value={shared.gender}
            options={genderOptions}
            onChange={setS("gender")}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Розміри
            </label>
            <Input
              value={shared.sizes}
              onChange={(e) => setS("sizes")(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Підтягнуто з картки товару (довідники) — за потреби скоригуйте, потім
          «Зберегти». Значення потраплять у кожен опис.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={savingShared}
          onClick={saveShared}
        >
          {savingShared ? "…" : "Зберегти характеристики"}
        </Button>
      </div>

      {task.bags.map((bag, i) => (
        <BagCard
          key={bag.id}
          taskId={task.id}
          bag={bag}
          index={i}
          total={task.bags.length}
          onSaveShared={saveShared}
          onDescribed={(id) =>
            setDescribed((s) => {
              const next = new Set(s);
              next.add(id);
              return next;
            })
          }
        />
      ))}

      <div className="rounded-md border bg-white p-4">
        <Button
          type="button"
          disabled={finishing || !allDescribed}
          onClick={finish}
          title={allDescribed ? undefined : "Сформуйте опис для кожного мішка"}
        >
          {finishing ? "…" : "Готово"}
        </Button>
        {!allDescribed ? (
          <p className="mt-1 text-xs text-gray-500">
            Кнопка активна, коли для кожного мішка сформовано YouTube-опис.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Картка одного мішка у зйомці: вага/к-сть/відео + опис. */
function BagCard({
  taskId,
  bag,
  index,
  total,
  onSaveShared,
  onDescribed,
}: {
  taskId: string;
  bag: VideoBagView;
  index: number;
  total: number;
  onSaveShared: () => Promise<boolean>;
  onDescribed: (bagId: string) => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    unitsCount: bag.unitsCount ?? "",
    unitWeight: bag.unitWeight ?? "",
    lotWeightKg:
      bag.lotWeightKg != null
        ? String(bag.lotWeightKg)
        : bag.weight != null
          ? String(bag.weight)
          : "",
    videoUrl: bag.videoUrl ?? "",
  });
  const [description, setDescription] = useState(bag.youtubeDescription ?? "");
  const [busy, setBusy] = useState(false);

  // Вага одиниці = вага лота ÷ кількість (авто, редагована).
  function recalc(units: string, lotKg: string): string {
    const u = parseFloat(units.replace(",", "."));
    const w = parseFloat(lotKg.replace(",", "."));
    if (u > 0 && w > 0) return String(Math.round((w / u) * 1000) / 1000);
    return form.unitWeight;
  }
  const setUnits = (v: string) =>
    setForm((f) => ({
      ...f,
      unitsCount: v,
      unitWeight: recalc(v, f.lotWeightKg),
    }));
  const setLotKg = (v: string) =>
    setForm((f) => ({
      ...f,
      lotWeightKg: v,
      unitWeight: recalc(f.unitsCount, v),
    }));

  async function saveBag(): Promise<boolean> {
    const res = await fetch(
      `/api/v1/manager/video-tasks/${taskId}/bags/${bag.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitsCount: form.unitsCount,
          unitWeight: form.unitWeight,
          lotWeightKg: form.lotWeightKg ? Number(form.lotWeightKg) : null,
          videoUrl: form.videoUrl,
        }),
      },
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      toast({
        title: data.error ?? "Не вдалося зберегти",
        variant: "destructive",
      });
      return false;
    }
    return true;
  }

  async function formDescription() {
    if (!form.videoUrl.trim()) {
      toast({
        title: "Спершу вставте посилання на відео",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const okShared = await onSaveShared();
      if (!okShared) return;
      const okBag = await saveBag();
      if (!okBag) return;
      const res = await fetch(
        `/api/v1/manager/video-tasks/${taskId}/bags/${bag.id}/description`,
        { method: "POST" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        description?: string;
      };
      if (!res.ok || !data.description) {
        toast({
          title: data.error ?? "Не вдалося сформувати опис",
          variant: "destructive",
        });
        return;
      }
      setDescription(data.description);
      onDescribed(bag.id);
      toast({ title: "Опис сформовано" });
    } finally {
      setBusy(false);
    }
  }

  async function copyDescription() {
    try {
      await navigator.clipboard.writeText(description);
      toast({ title: "Опис скопійовано" });
    } catch {
      toast({ title: "Не вдалося скопіювати", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-3 rounded-md border bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800">
          Мішок {total > 1 ? `${index + 1} з ${total}` : ""}{" "}
          <span className="font-mono text-gray-500">{bag.barcode}</span>
        </h3>
        {description ? (
          <span className="rounded bg-green-50 px-2 py-0.5 text-xs text-green-700">
            опис є
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Вага лота, кг
          </label>
          <Input
            type="number"
            value={form.lotWeightKg}
            onChange={(e) => setLotKg(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Кількість одиниць
          </label>
          <Input
            type="number"
            value={form.unitsCount}
            onChange={(e) => setUnits(e.target.value)}
            placeholder="напр. 20"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Вага одиниці
          </label>
          <Input
            value={form.unitWeight}
            onChange={(e) =>
              setForm((f) => ({ ...f, unitWeight: e.target.value }))
            }
            placeholder="авто"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Посилання на відео (YouTube)
        </label>
        <Input
          value={form.videoUrl}
          onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))}
          placeholder="https://youtu.be/…"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void saveBag()}
        >
          Зберегти
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={formDescription}
        >
          {busy ? "…" : "Сформувати опис YouTube"}
        </Button>
      </div>

      {description ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">
              YouTube-опис
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyDescription}
            >
              Скопіювати
            </Button>
          </div>
          <textarea
            readOnly
            value={description}
            rows={12}
            className="w-full rounded-md border border-input bg-gray-50 p-2 font-mono text-xs"
          />
        </div>
      ) : null}
    </div>
  );
}

/** Завершене завдання — по кожному мішку відео + опис (копіювання). */
function DoneSection({ task }: { task: VideoTaskView }) {
  const { toast } = useToast();

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Опис скопійовано" });
    } catch {
      toast({ title: "Не вдалося скопіювати", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-3">
      {task.assignedName ? (
        <p className="text-sm text-gray-500">Виконав: {task.assignedName}</p>
      ) : null}
      {task.bags.map((bag, i) => (
        <div key={bag.id} className="space-y-2 rounded-md border bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">
              Мішок {task.bags.length > 1 ? `${i + 1}` : ""}{" "}
              <span className="font-mono text-gray-500">{bag.barcode}</span>
              {bag.lotWeightKg != null ? (
                <span className="ml-2 text-gray-500">{bag.lotWeightKg} кг</span>
              ) : null}
            </h3>
            {bag.youtubeDescription ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copy(bag.youtubeDescription!)}
              >
                Скопіювати опис
              </Button>
            ) : null}
          </div>
          {bag.videoUrl ? (
            <p className="text-sm">
              Відео:{" "}
              <a
                href={bag.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 underline"
              >
                {bag.videoUrl}
              </a>
            </p>
          ) : null}
          {bag.youtubeDescription ? (
            <textarea
              readOnly
              value={bag.youtubeDescription}
              rows={8}
              className="w-full rounded-md border border-input bg-gray-50 p-2 font-mono text-xs"
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
