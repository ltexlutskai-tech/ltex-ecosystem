"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, useToast } from "@ltex/ui";
import { usePortalConfirm } from "../../../_components/use-portal-confirm";

export interface VideoTaskView {
  id: string;
  status: string;
  managerName: string | null;
  clientName: string | null;
  productName: string;
  articleCode: string | null;
  quantity: number;
  barcode: string | null;
  requestedBarcode: string | null;
  assignedName: string | null;
  videoUrl: string | null;
  youtubeDescription: string | null;
  season: string | null;
  quality: string | null;
  gender: string | null;
  sizes: string | null;
  unitsCount: string | null;
  unitWeight: string | null;
  lotWeightKg: number | null;
  completedAt: string | null;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  new: { label: "Принести мішок", cls: "bg-amber-100 text-amber-700" },
  filming: { label: "На зйомці", cls: "bg-blue-100 text-blue-700" },
  done: { label: "Готово", cls: "bg-green-100 text-green-700" },
  cancelled: { label: "Скасовано", cls: "bg-gray-100 text-gray-500" },
};

const FILM_ROLES = ["videozone", "admin", "owner"];
const BRING_ROLES = ["warehouse", "admin", "owner"];

export function VideoTaskDetail({
  task,
  role,
}: {
  task: VideoTaskView;
  role: string;
}) {
  const router = useRouter();
  const { confirm, dialog } = usePortalConfirm();

  const meta = STATUS_META[task.status] ?? STATUS_META.new!;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-gray-900">
            {task.productName}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Клієнт:{" "}
            <span className="font-medium">{task.clientName ?? "—"}</span> ·{" "}
            {task.quantity} шт.
            {task.articleCode ? ` · арт. ${task.articleCode}` : ""}
            {task.managerName ? ` · замовив: ${task.managerName}` : ""}
          </p>
          {task.barcode ? (
            <p className="mt-0.5 text-sm text-gray-500">
              Мішок: <span className="font-mono">{task.barcode}</span>
            </p>
          ) : task.requestedBarcode ? (
            <p className="mt-0.5 text-sm text-gray-500">
              Просили мішок:{" "}
              <span className="font-mono">{task.requestedBarcode}</span>
            </p>
          ) : null}
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${meta.cls}`}
        >
          {meta.label}
        </span>
      </div>

      {task.status === "new" && BRING_ROLES.includes(role) ? (
        <BringSection task={task} />
      ) : null}

      {task.status === "filming" && FILM_ROLES.includes(role) ? (
        <FilmSection task={task} />
      ) : null}

      {task.status === "done" ? <DoneSection task={task} /> : null}

      {task.status !== "done" &&
      !(task.status === "new" && BRING_ROLES.includes(role)) &&
      !(task.status === "filming" && FILM_ROLES.includes(role)) ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-gray-500">
          {task.status === "new"
            ? "Очікуємо, поки склад принесе мішок."
            : "Завдання на зйомці у відеозоні."}
        </p>
      ) : null}

      <div className="pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (task.status === "filming" && FILM_ROLES.includes(role)) {
              confirm({
                title: "Скасувати завдання?",
                message: "Завдання буде скасовано без збереження.",
                destructive: true,
                confirmLabel: "Скасувати завдання",
                cancelLabel: "Ні",
                onConfirm: () => router.push("/manager/video-tasks"),
              });
            } else {
              router.push("/manager/video-tasks");
            }
          }}
        >
          ← До списку
        </Button>
      </div>
      {dialog}
    </>
  );
}

/** Крок складу: принести мішок (обрати ШК або авто-рандом). */
function BringSection({ task }: { task: VideoTaskView }) {
  const router = useRouter();
  const { toast } = useToast();
  const [barcode, setBarcode] = useState(task.requestedBarcode ?? "");
  const [busy, setBusy] = useState(false);

  async function bring(useBarcode: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/manager/video-tasks/${task.id}/bring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          useBarcode && barcode.trim() ? { barcode: barcode.trim() } : {},
        ),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        barcode?: string;
      };
      if (!res.ok) {
        toast({
          title: data.error ?? "Не вдалося",
          variant: "destructive",
        });
        return;
      }
      toast({ title: `Мішок ${data.barcode ?? ""} передано у відеозону` });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border bg-white p-4">
      <p className="text-sm text-gray-600">
        Візьміть будь-який вільний мішок цього товару, відскануйте штрихкод (або
        залиште порожнім — система візьме випадковий вільний мішок).
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Штрихкод мішка
          </label>
          <Input
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Відскануйте або введіть ШК"
          />
        </div>
        <Button
          type="button"
          disabled={busy || !barcode.trim()}
          onClick={() => bring(true)}
        >
          Передати цей мішок
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => bring(false)}
        >
          Взяти будь-який
        </Button>
      </div>
    </div>
  );
}

/** Крок відеозони: характеристики + відео + опис + Готово. */
function FilmSection({ task }: { task: VideoTaskView }) {
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = useState({
    season: task.season ?? "",
    quality: task.quality ?? "",
    gender: task.gender ?? "",
    sizes: task.sizes ?? "",
    unitsCount: task.unitsCount ?? "",
    unitWeight: task.unitWeight ?? "",
    lotWeightKg: task.lotWeightKg != null ? String(task.lotWeightKg) : "",
    videoUrl: task.videoUrl ?? "",
  });
  const [description, setDescription] = useState(task.youtubeDescription ?? "");
  const [saving, setSaving] = useState(false);
  const [forming, setForming] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function save(): Promise<boolean> {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/manager/video-tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          season: form.season,
          quality: form.quality,
          gender: form.gender,
          sizes: form.sizes,
          unitsCount: form.unitsCount,
          unitWeight: form.unitWeight,
          lotWeightKg: form.lotWeightKg ? Number(form.lotWeightKg) : null,
          videoUrl: form.videoUrl,
        }),
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
      setSaving(false);
    }
  }

  async function formDescription() {
    if (!form.videoUrl.trim()) {
      toast({
        title: "Спершу вставте посилання на відео",
        variant: "destructive",
      });
      return;
    }
    setForming(true);
    try {
      const ok = await save();
      if (!ok) return;
      const res = await fetch(
        `/api/v1/manager/video-tasks/${task.id}/description`,
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
      toast({ title: "Опис сформовано" });
    } finally {
      setForming(false);
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
        title: "Готово! Лот заброньовано, менеджеру надіслано сповіщення.",
      });
      router.push("/manager/video-tasks");
      router.refresh();
    } finally {
      setFinishing(false);
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

  const fields: {
    key: keyof typeof form;
    label: string;
    placeholder?: string;
    type?: string;
  }[] = [
    { key: "season", label: "Сезон" },
    { key: "quality", label: "Сорт" },
    { key: "unitsCount", label: "Кількість одиниць" },
    { key: "unitWeight", label: "Вага одиниці" },
    { key: "lotWeightKg", label: "Вага лота, кг", type: "number" },
    { key: "gender", label: "Стать" },
    { key: "sizes", label: "Розміри" },
  ];

  return (
    <div className="space-y-4 rounded-md border bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-800">
        Характеристики лота
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {f.label}
            </label>
            <Input
              type={f.type ?? "text"}
              value={form[f.key]}
              onChange={(e) => set(f.key)(e.target.value)}
              placeholder={f.placeholder}
            />
          </div>
        ))}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Посилання на відео (YouTube)
        </label>
        <Input
          value={form.videoUrl}
          onChange={(e) => set("videoUrl")(e.target.value)}
          placeholder="https://youtu.be/…"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={save}
        >
          {saving ? "…" : "Зберегти"}
        </Button>
        <Button type="button" disabled={forming} onClick={formDescription}>
          {forming ? "…" : "Сформувати опис YouTube"}
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
            rows={14}
            className="w-full rounded-md border border-input bg-gray-50 p-2 font-mono text-xs"
          />
        </div>
      ) : null}

      <div className="border-t pt-3">
        <Button
          type="button"
          disabled={finishing || !description}
          onClick={finish}
          title={description ? undefined : "Спершу сформуйте YouTube-опис"}
        >
          {finishing ? "…" : "Готово"}
        </Button>
        {!description ? (
          <p className="mt-1 text-xs text-gray-500">
            Кнопка активна після формування опису.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Завершене завдання — характеристики + опис (лише перегляд + копіювання). */
function DoneSection({ task }: { task: VideoTaskView }) {
  const { toast } = useToast();
  const rows: [string, string | null][] = [
    ["Сезон", task.season],
    ["Сорт", task.quality],
    ["Кількість одиниць", task.unitsCount],
    ["Вага одиниці", task.unitWeight],
    [
      "Вага лота, кг",
      task.lotWeightKg != null ? String(task.lotWeightKg) : null,
    ],
    ["Стать", task.gender],
    ["Розміри", task.sizes],
    ["Виконав", task.assignedName],
  ];

  async function copy() {
    if (!task.youtubeDescription) return;
    try {
      await navigator.clipboard.writeText(task.youtubeDescription);
      toast({ title: "Опис скопійовано" });
    } catch {
      toast({ title: "Не вдалося скопіювати", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4 rounded-md border bg-white p-4">
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2 text-sm">
              <dt className="text-gray-500">{k}</dt>
              <dd className="font-medium text-gray-900">{v}</dd>
            </div>
          ))}
      </dl>
      {task.videoUrl ? (
        <p className="text-sm">
          Відео:{" "}
          <a
            href={task.videoUrl}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 underline"
          >
            {task.videoUrl}
          </a>
        </p>
      ) : null}
      {task.youtubeDescription ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              YouTube-опис
            </span>
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              Скопіювати
            </Button>
          </div>
          <textarea
            readOnly
            value={task.youtubeDescription}
            rows={14}
            className="w-full rounded-md border border-input bg-gray-50 p-2 font-mono text-xs"
          />
        </div>
      ) : null}
    </div>
  );
}
