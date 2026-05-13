"use client";

import { useState } from "react";
import { Camera, ScanBarcode } from "lucide-react";
import { useToast } from "@ltex/ui";

export function HeaderBarcode() {
  const [value, setValue] = useState("");
  const { toast } = useToast();

  function notSoon() {
    toast({
      title: "Сканер ШК буде у M1.4",
      description: "Зчитування штрих-кодів додамо у наступному оновленні.",
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    notSoon();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative hidden w-56 lg:block"
      role="search"
    >
      <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="ШК..."
        aria-label="Штрих-код"
        className="h-9 w-full rounded-md border border-input bg-white pl-9 pr-10 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <button
        type="button"
        onClick={notSoon}
        aria-label="Сканувати камерою"
        className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100"
      >
        <Camera className="h-4 w-4" />
      </button>
    </form>
  );
}
