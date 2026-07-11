import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("sharp", () => {
  const chain = {
    rotate: () => chain,
    resize: () => chain,
    webp: () => chain,
    toBuffer: async () => Buffer.from("optimized-webp"),
    metadata: async () => ({ width: 120, height: 90 }),
  };
  return { default: () => chain };
});

const { saveMediaFileMock } = vi.hoisted(() => ({
  saveMediaFileMock: vi.fn(async (rel: string) => `https://x/media/${rel}`),
}));
vi.mock("@/lib/media/storage", () => ({
  saveMediaFile: saveMediaFileMock,
}));

import { AttachmentError, saveMessengerAttachment } from "./attachments";

function file(name: string, type: string, bytes = 10): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveMessengerAttachment", () => {
  it("rejects empty files", async () => {
    await expect(
      saveMessengerAttachment("c1", file("x.pdf", "application/pdf", 0)),
    ).rejects.toBeInstanceOf(AttachmentError);
  });

  it("rejects unsupported types", async () => {
    await expect(
      saveMessengerAttachment(
        "c1",
        file("virus.exe", "application/x-msdownload"),
      ),
    ).rejects.toMatchObject({ code: "unsupported" });
  });

  it("saves an image as optimized webp with dimensions", async () => {
    const res = await saveMessengerAttachment(
      "c1",
      file("photo.jpg", "image/jpeg", 1000),
    );
    expect(res.kind).toBe("image");
    expect(res.mimeType).toBe("image/webp");
    expect(res.width).toBe(120);
    expect(res.height).toBe(90);
    expect(res.url).toContain("/media/messenger/c1/");
    expect(res.url).toContain(".webp");
  });

  it("saves a pdf as a file, preserving name", async () => {
    const res = await saveMessengerAttachment(
      "c1",
      file("Накладна.pdf", "application/pdf", 2000),
    );
    expect(res.kind).toBe("file");
    expect(res.mimeType).toBe("application/pdf");
    expect(res.name).toBe("Накладна.pdf");
    expect(res.url).toContain(".pdf");
    expect(res.width).toBeNull();
  });

  it("accepts xlsx by extension even without mime", async () => {
    const res = await saveMessengerAttachment("c1", file("звіт.xlsx", ""));
    expect(res.kind).toBe("file");
    expect(res.mimeType).toContain("spreadsheetml");
  });
});
