"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ScanLine, X } from "lucide-react";
import { Button, Input } from "@ltex/ui";

/**
 * Поле введення ШК для Реалізації (Етап 2). Два шляхи додавання:
 *  1. **Ручний ввід / USB-сканер** — звичайний text input; Enter подає код
 *     (USB-сканери емулюють клавіатуру і шлють Enter після коду).
 *  2. **Камера** — нативний `BarcodeDetector` API (Chrome/Android, PWA, Tauri
 *     webview). БЕЗ npm-залежностей: якщо API недоступне — кнопка disabled з
 *     підказкою «введіть ШК вручну».
 *
 * На будь-який код (введений чи відсканований) викликається `onCode(code)` —
 * батько резолвить через `GET /lots/by-barcode`. Помилки резолву (не знайдено
 * / дубль) приходять назад через `error` prop.
 */

// ─── Narrow ambient типи для BarcodeDetector (немає у lib.dom усіх версій) ──
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorInstance {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorInstance;
}

/** Чи доступний нативний BarcodeDetector у цьому браузері. */
function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}

export function BarcodeInput({
  onCode,
  error,
  disabled = false,
}: {
  /** Викликається на введений/відсканований код. */
  onCode: (code: string) => void;
  /** Inline-помилка резолву (передається батьком). */
  error?: string | null;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [detectorAvailable, setDetectorAvailable] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    setDetectorAvailable(getBarcodeDetectorCtor() !== null);
  }, []);

  function submitManual(): void {
    const code = value.trim();
    if (!code) return;
    onCode(code);
    setValue("");
  }

  function stopCamera(): void {
    stoppedRef.current = true;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  }

  async function openCamera(): Promise<void> {
    const Ctor = getBarcodeDetectorCtor();
    if (!Ctor) return;
    setCameraError(null);
    setCameraOpen(true);
    stoppedRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stopCamera();
        return;
      }
      video.srcObject = stream;
      await video.play();

      const detector = new Ctor();
      const scan = async (): Promise<void> => {
        if (stoppedRef.current) return;
        try {
          const found = await detector.detect(video);
          const hit = found.find((b) => b.rawValue.trim().length > 0);
          if (hit) {
            const code = hit.rawValue.trim();
            stopCamera();
            onCode(code);
            return;
          }
        } catch {
          // одиничний кадр не зчитався — продовжуємо петлю
        }
        rafRef.current = requestAnimationFrame(() => {
          void scan();
        });
      };
      void scan();
    } catch (e) {
      setCameraError(
        (e as Error).name === "NotAllowedError"
          ? "Доступ до камери заборонено."
          : "Не вдалося відкрити камеру.",
      );
      stopCamera();
    }
  }

  // Зупинка камери при розмонтуванні.
  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs text-gray-500">Штрихкод</label>
          <div className="relative">
            <ScanLine className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              type="text"
              inputMode="numeric"
              value={value}
              disabled={disabled}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitManual();
                }
              }}
              placeholder="Відскануйте або введіть ШК і натисніть Enter"
              className="pl-8"
            />
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={submitManual}
          disabled={disabled || value.trim().length === 0}
        >
          Додати
        </Button>

        <Button
          type="button"
          variant="outline"
          onClick={() => void openCamera()}
          disabled={disabled || !detectorAvailable}
          title={
            detectorAvailable
              ? "Сканувати камерою"
              : "Камера недоступна — введіть ШК вручну"
          }
        >
          <Camera className="mr-1 h-4 w-4" />
          Сканувати камерою
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {cameraOpen && (
        <div className="relative overflow-hidden rounded-lg border bg-black">
          <button
            type="button"
            onClick={stopCamera}
            className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
            aria-label="Закрити камеру"
          >
            <X className="h-4 w-4" />
          </button>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={videoRef}
            className="mx-auto max-h-72 w-full object-contain"
            muted
            playsInline
          />
          {cameraError && (
            <p className="bg-red-50 p-2 text-center text-sm text-red-600">
              {cameraError}
            </p>
          )}
        </div>
      )}
      {!detectorAvailable && (
        <p className="text-xs text-gray-400">
          Сканування камерою недоступне у цьому браузері — використовуйте USB-
          сканер або ручний ввід.
        </p>
      )}
    </div>
  );
}
