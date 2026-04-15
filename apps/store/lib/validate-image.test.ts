import { describe, it, expect } from "vitest";
import {
  detectImageType,
  validateImageFile,
  InvalidImageError,
} from "./validate-image";

function makeBytes(prefix: number[], totalLen = 16): Uint8Array {
  const out = new Uint8Array(totalLen);
  for (let i = 0; i < prefix.length; i++) out[i] = prefix[i]!;
  return out;
}

function makeFile(bytes: Uint8Array, name = "upload.bin", type = ""): File {
  // Copy into a fresh ArrayBuffer so File's BlobPart typing is happy in TS strict mode.
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return new File([buf], name, { type });
}

describe("detectImageType", () => {
  it("detects JPEG", () => {
    expect(detectImageType(makeBytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
  });

  it("detects PNG", () => {
    expect(
      detectImageType(
        makeBytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe("png");
  });

  it("detects GIF87a", () => {
    expect(
      detectImageType(makeBytes([0x47, 0x49, 0x46, 0x38, 0x37, 0x61])),
    ).toBe("gif");
  });

  it("detects GIF89a", () => {
    expect(
      detectImageType(makeBytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])),
    ).toBe("gif");
  });

  it("detects WEBP", () => {
    // RIFF....WEBP
    const bytes = makeBytes([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(detectImageType(bytes)).toBe("webp");
  });

  it("returns null for unknown bytes", () => {
    expect(detectImageType(makeBytes([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });

  it("returns null when too short", () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });

  it("rejects renamed executable (MZ header)", () => {
    // PE/EXE starts with "MZ"
    expect(detectImageType(makeBytes([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
  });
});

describe("validateImageFile", () => {
  it("accepts a valid JPEG file", async () => {
    const file = makeFile(makeBytes([0xff, 0xd8, 0xff, 0xe0]), "photo.jpg");
    const result = await validateImageFile(file);
    expect(result).toEqual({ type: "jpeg", mime: "image/jpeg" });
  });

  it("accepts a valid PNG regardless of .jpg extension", async () => {
    const file = makeFile(
      makeBytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "disguised.jpg",
    );
    const result = await validateImageFile(file);
    expect(result.type).toBe("png");
  });

  it("rejects empty file", async () => {
    const file = new File([], "empty.jpg");
    await expect(validateImageFile(file)).rejects.toThrow(InvalidImageError);
    await expect(validateImageFile(file)).rejects.toMatchObject({
      code: "empty",
    });
  });

  it("rejects file over size limit", async () => {
    const bytes = new Uint8Array(2_000_000);
    bytes[0] = 0xff;
    bytes[1] = 0xd8;
    bytes[2] = 0xff;
    const file = makeFile(bytes, "big.jpg");
    await expect(
      validateImageFile(file, { maxBytes: 1_000_000 }),
    ).rejects.toMatchObject({ code: "too_large" });
  });

  it("rejects unsupported format (renamed .exe)", async () => {
    const file = makeFile(
      makeBytes([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]),
      "shell.jpg",
      "image/jpeg",
    );
    await expect(validateImageFile(file)).rejects.toMatchObject({
      code: "unsupported_format",
    });
  });

  it("ignores user-supplied mime type and trusts magic bytes", async () => {
    // Valid JPEG bytes but with bogus mime declared
    const file = makeFile(
      makeBytes([0xff, 0xd8, 0xff, 0xe0]),
      "photo.png",
      "application/octet-stream",
    );
    const result = await validateImageFile(file);
    expect(result.mime).toBe("image/jpeg");
    expect(result.type).toBe("jpeg");
  });
});
