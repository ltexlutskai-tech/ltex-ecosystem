import { describe, it, expect } from "vitest";
import path from "path";
import { resolveInsideRoot } from "./storage";

const ROOT = path.resolve("/srv/ltex-media");

describe("resolveInsideRoot", () => {
  it("resolves a valid nested path inside the root", () => {
    const result = resolveInsideRoot("product-images/abc/123.webp", ROOT);
    expect(result).toBe(path.join(ROOT, "product-images", "abc", "123.webp"));
  });

  it("resolves a single-segment path", () => {
    expect(resolveInsideRoot("banners/1.webp", ROOT)).toBe(
      path.join(ROOT, "banners", "1.webp"),
    );
  });

  it("accepts backslash-separated input by normalizing slashes", () => {
    expect(resolveInsideRoot("banners\\1.webp", ROOT)).toBe(
      path.join(ROOT, "banners", "1.webp"),
    );
  });

  it("rejects `..` traversal that escapes the root", () => {
    expect(() => resolveInsideRoot("../secrets.txt", ROOT)).toThrow();
    expect(() =>
      resolveInsideRoot("product-images/../../etc/passwd", ROOT),
    ).toThrow();
  });

  it("rejects an absolute POSIX path", () => {
    expect(() => resolveInsideRoot("/etc/passwd", ROOT)).toThrow();
  });

  it("rejects an absolute Windows path", () => {
    expect(() => resolveInsideRoot("C:\\Windows\\system32", ROOT)).toThrow();
  });

  it("allows the root itself (empty-ish) but not a sibling with same prefix", () => {
    // A sibling dir sharing the root's name prefix must not pass.
    expect(() =>
      resolveInsideRoot("../ltex-media-evil/x.webp", ROOT),
    ).toThrow();
  });
});
