import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLocalDraft,
  isLocalNewer,
  localDraftKey,
  readLocalDraft,
  writeLocalDraft,
} from "./local-draft";

describe("localDraftKey", () => {
  it('нове → суфікс "new"', () => {
    expect(localDraftKey("sale", null)).toBe("ltex:draft:sale:new");
  });
  it("наявний id", () => {
    expect(localDraftKey("sale", "abc")).toBe("ltex:draft:sale:abc");
  });
});

describe("write/read/clear local draft", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("round-trip зберігає data + savedAt", () => {
    writeLocalDraft("k", { a: 1, b: "x" }, "2026-07-09T10:00:00.000Z");
    const env = readLocalDraft<{ a: number; b: string }>("k");
    expect(env?.data).toEqual({ a: 1, b: "x" });
    expect(env?.savedAt).toBe("2026-07-09T10:00:00.000Z");
  });

  it("clear видаляє", () => {
    writeLocalDraft("k", { a: 1 }, "2026-07-09T10:00:00.000Z");
    clearLocalDraft("k");
    expect(readLocalDraft("k")).toBeNull();
  });

  it("пошкоджений JSON → null (не кидає)", () => {
    store.set("k", "{not json");
    expect(readLocalDraft("k")).toBeNull();
  });

  it("відсутній ключ → null", () => {
    expect(readLocalDraft("missing")).toBeNull();
  });
});

describe("isLocalNewer", () => {
  it("немає локального → false", () => {
    expect(isLocalNewer(null, "2026-07-09T10:00:00Z")).toBe(false);
  });
  it("є локальний, немає серверного → true", () => {
    expect(isLocalNewer("2026-07-09T10:00:00Z", null)).toBe(true);
  });
  it("локальний новіший за серверний (понад 2с) → true", () => {
    expect(isLocalNewer("2026-07-09T10:00:05Z", "2026-07-09T10:00:00Z")).toBe(
      true,
    );
  });
  it("локальний у межах 2с → false (власне збереження)", () => {
    expect(isLocalNewer("2026-07-09T10:00:01Z", "2026-07-09T10:00:00Z")).toBe(
      false,
    );
  });
});
