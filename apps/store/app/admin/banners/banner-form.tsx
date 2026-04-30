"use client";

import { useRef, useState } from "react";
import { Button, Input, toast } from "@ltex/ui";
import { Upload } from "lucide-react";
import { createBanner, updateBanner, uploadBannerImage } from "./actions";
import type { Banner } from "@ltex/db";

interface BannerFormProps {
  banner: Banner | null;
}

export function BannerForm({ banner }: BannerFormProps) {
  const [imageUrl, setImageUrl] = useState(banner?.imageUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Hard limit matching next.config.js serverActions.bodySizeLimit (10 MB).
    // Fail fast on the client so the user sees a clear message instead of
    // Next.js's opaque "unexpected response" when the request body is rejected.
    const MAX_SIZE_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      toast({
        title: "Файл завеликий",
        description: `Розмір зображення — ${(file.size / 1024 / 1024).toFixed(1)} MB. Максимум 10 MB. Стисніть через squoosh.app або збережіть у JPG ~80% якості.`,
        variant: "destructive",
      });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const { url } = await uploadBannerImage(formData);
      setImageUrl(url);
      toast({ title: "Зображення завантажено", variant: "success" });
    } catch (err) {
      toast({
        title: "Помилка завантаження",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const action = banner ? updateBanner.bind(null, banner.id) : createBanner;

  return (
    <form
      action={action}
      className="max-w-2xl space-y-4 rounded-lg border bg-white p-6"
    >
      <input type="hidden" name="imageUrl" value={imageUrl} />

      <div>
        <label className="mb-1 block text-sm font-medium">Зображення *</label>
        <p className="mb-2 text-xs text-gray-500">
          Готова картинка з усім текстом / лого / закликом всередині.
          Рекомендований розмір 1920×1080 (16:9).
        </p>
        {imageUrl ? (
          <div className="mb-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Прев'ю"
              className="aspect-[16/9] w-full max-w-md rounded-md border object-cover"
            />
          </div>
        ) : null}
        <div
          onClick={() => fileRef.current?.click()}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-6 transition hover:border-gray-400"
        >
          <Upload className="h-6 w-6 text-gray-400" />
          <p className="text-sm text-gray-500">
            {uploading
              ? "Завантаження..."
              : imageUrl
                ? "Натисніть щоб замінити зображення"
                : "Натисніть щоб вибрати зображення"}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="ban-cta-href"
          className="mb-1 block text-sm font-medium"
        >
          Посилання *
        </label>
        <Input
          id="ban-cta-href"
          name="ctaHref"
          defaultValue={banner?.ctaHref ?? ""}
          placeholder="Посилання (обов'язкове) — наприклад /catalog або https://..."
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="ban-position"
            className="mb-1 block text-sm font-medium"
          >
            Позиція
          </label>
          <Input
            id="ban-position"
            name="position"
            type="number"
            min="0"
            defaultValue={banner?.position ?? 0}
          />
        </div>
        <div className="flex items-end gap-2">
          <input
            type="checkbox"
            id="ban-active"
            name="isActive"
            defaultChecked={banner?.isActive ?? true}
          />
          <label htmlFor="ban-active" className="text-sm">
            Активний
          </label>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={!imageUrl || uploading}>
          {banner ? "Зберегти" : "Створити"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <a href="/admin/banners">Скасувати</a>
        </Button>
      </div>
    </form>
  );
}
