"use client";

import { useRef, useState } from "react";
import { Button } from "@ltex/ui";
import { uploadProductImage, deleteProductImage } from "./actions";
import { Upload, X } from "lucide-react";
import type { ProductImage } from "@ltex/db";

interface ImageUploadProps {
  productId: string;
  images: ProductImage[];
}

export function ImageUpload({ productId, images }: ImageUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      await uploadProductImage(productId, formData);
    } finally {
      setUploading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }

  return (
    <div className="max-w-2xl space-y-4 rounded-lg border bg-white p-6">
      <h2 className="text-lg font-semibold">Фотографії</h2>

      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {images.map((img) => (
            <div key={img.id} className="group relative">
              <img
                src={img.url}
                alt={img.alt}
                className="h-24 w-full rounded-md border object-cover"
              />
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
            : "Перетягніть фото або натисніть для вибору"}
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
  );
}
