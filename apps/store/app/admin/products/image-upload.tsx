"use client";

import { useRef, useState } from "react";
import { Button } from "@ltex/ui";
import {
  uploadProductImage,
  deleteProductImage,
  reorderProductImages,
} from "./actions";
import { Upload, X, GripVertical } from "lucide-react";
import { toast } from "@ltex/ui";
import type { ProductImage } from "@ltex/db";

interface ImageUploadProps {
  productId: string;
  images: ProductImage[];
}

export function ImageUpload({ productId, images }: ImageUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);

  async function handleUpload(files: FileList | File[]) {
    const fileArray = Array.from(files).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (fileArray.length === 0) return;

    // Show previews
    const urls = fileArray.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    setUploading(true);

    try {
      for (const file of fileArray) {
        const formData = new FormData();
        formData.set("file", file);
        await uploadProductImage(productId, formData);
      }
      toast({
        title: `Завантажено ${fileArray.length} фото`,
        variant: "success",
      });
    } catch {
      toast({
        title: "Помилка завантаження",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setPreviews([]);
      urls.forEach((u) => URL.revokeObjectURL(u));
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (files && files.length > 0) handleUpload(files);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  }

  async function handleReorderDrop(targetIndex: number) {
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      return;
    }
    const reordered = [...images];
    const [moved] = reordered.splice(draggedIndex, 1);
    if (!moved) return;
    reordered.splice(targetIndex, 0, moved);
    const ids = reordered.map((img) => img.id);
    setDraggedIndex(null);
    try {
      await reorderProductImages(productId, ids);
      toast({ title: "Порядок фото оновлено", variant: "success" });
    } catch {
      toast({
        title: "Помилка зміни порядку",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="max-w-2xl space-y-4 rounded-lg border bg-white p-6">
      <h2 className="text-lg font-semibold">Фотографії ({images.length})</h2>

      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {images.map((img, index) => (
            <div
              key={img.id}
              className={`group relative rounded-md border ${
                draggedIndex === index ? "opacity-50" : ""
              }`}
              draggable
              onDragStart={() => setDraggedIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleReorderDrop(index)}
              onDragEnd={() => setDraggedIndex(null)}
            >
              <div className="absolute left-1 top-1 cursor-grab rounded bg-white/80 p-0.5 opacity-0 transition group-hover:opacity-100">
                <GripVertical className="h-3 w-3 text-gray-400" />
              </div>
              <img
                src={img.url}
                alt={img.alt}
                className="h-24 w-full rounded-md object-cover"
              />
              {index === 0 && (
                <span className="absolute bottom-1 left-1 rounded bg-green-600 px-1 text-[10px] text-white">
                  Головне
                </span>
              )}
              <form action={deleteProductImage.bind(null, img.id, productId)}>
                <button
                  type="submit"
                  className="absolute -right-1 -top-1 rounded-full bg-red-500 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      {/* Preview of uploading files */}
      {previews.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {previews.map((url, i) => (
            <div key={i} className="animate-pulse rounded-md border">
              <img
                src={url}
                alt="Завантаження..."
                className="h-24 w-full rounded-md object-cover opacity-60"
              />
            </div>
          ))}
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 transition ${
          dragOver
            ? "border-green-500 bg-green-50"
            : "border-gray-300 hover:border-gray-400"
        }`}
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="h-6 w-6 text-gray-400" />
        <p className="text-sm text-gray-500">
          {uploading
            ? "Завантаження..."
            : "Перетягніть фото або натисніть для вибору (можна кілька)"}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
