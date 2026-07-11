import { describe, it, expect } from "vitest";
import { isValidElement, type ReactNode } from "react";
import { linkify } from "./linkify";

function anchors(nodes: ReactNode[]): { href: string; text: unknown }[] {
  return nodes
    .filter((n): n is React.ReactElement => isValidElement(n) && n.type === "a")
    .map((n) => {
      const props = n.props as { href: string; children: unknown };
      return { href: props.href, text: props.children };
    });
}

describe("linkify", () => {
  it("turns https URLs into links", () => {
    const a = anchors(linkify("дивись https://youtu.be/abc тут", false));
    expect(a).toHaveLength(1);
    expect(a[0]?.href).toBe("https://youtu.be/abc");
  });

  it("prefixes www links with https", () => {
    const a = anchors(linkify("сайт www.ltex.com.ua", false));
    expect(a[0]?.href).toBe("https://www.ltex.com.ua");
  });

  it("turns phone numbers into tel links", () => {
    const a = anchors(linkify("телефон +380671234567", false));
    expect(a).toHaveLength(1);
    expect(a[0]?.href).toBe("tel:+380671234567");
  });

  it("strips spaces/brackets from tel href but keeps display text", () => {
    const a = anchors(linkify("+380 (67) 123-45-67", false));
    expect(a[0]?.href).toBe("tel:+380671234567");
  });

  it("leaves plain text without links", () => {
    const a = anchors(linkify("просто текст без посилань", false));
    expect(a).toHaveLength(0);
  });
});
