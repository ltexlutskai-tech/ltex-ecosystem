"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, ArrowUp, ArrowDown, ImagePlus } from "lucide-react";
import {
  uploadManagerProductImage,
  deleteManagerProductImage,
  reorderManagerProductImages,
} from "../photo-actions";

interface PhotoItem {
  id: string;
  url: string;
}

/**
 * Керування фото товару в CRM-картці (7.2 Блок 3). Видно лише ролям, що
 * керують каталогом (гейт — на сторінці + повторно в server actions).
 */
export function ProductPhotoManager({
  productId,
  images,
}: {
  productId: string;
  images: PhotoItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Помилка операції");
      }
    });
  }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    run(() => uploadManagerProductImage(productId, fd));
    if (fileRef.current) fileRef.current.value = "";
  }

  function move(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= images.length) return;
    const ids = images.map((i) => i.id);
    const a = ids[index];
    const b = ids[next];
    if (a === undefined || b === undefined) return;
    ids[index] = b;
    ids[next] = a;
    run(() => reorderManagerProductImages(productId, ids));
  }

  function remove(id: string) {
    if (!window.confirm("Видалити це фото?")) return;
    run(() => deleteManagerProductImage(id, productId));
  }

  return (
    <section className="rounded-lg border bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-gray-800">Фото товару</h2>
        <label
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 ${
            pending ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <ImagePlus className="h-4 w-4" />
          Додати фото
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onUpload}
            disabled={pending}
          />
        </label>
      </div>

      {error && (
        <p className="mb-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-600">
          {error}
        </p>
      )}

      {images.length === 0 ? (
        <p className="text-sm text-gray-400">Фото ще немає.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {images.map((img, i) => (
            <div
              key={img.id}
              className="group relative overflow-hidden rounded-md border bg-gray-50"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt=""
                className="aspect-square w-full object-cover"
              />
              {i === 0 && (
                <span className="absolute left-1 top-1 rounded bg-green-600 px-1 text-[10px] font-semibold text-white">
                  головне
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/50 px-1 py-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={pending || i === 0}
                  className="rounded p-0.5 text-white hover:bg-white/20 disabled:opacity-30"
                  aria-label="Вище"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={pending || i === images.length - 1}
                  className="rounded p-0.5 text-white hover:bg-white/20 disabled:opacity-30"
                  aria-label="Нижче"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => remove(img.id)}
                  disabled={pending}
                  className="rounded p-0.5 text-red-300 hover:bg-white/20"
                  aria-label="Видалити"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-gray-400">
        Перше фото — головне. WEBP-оптимізація автоматична.
      </p>
    </section>
  );
}
