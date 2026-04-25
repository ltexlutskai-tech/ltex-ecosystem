import { describe, it, expect } from "vitest";
import { t, getDictionary, getLocale, setLocale } from "./index";
import { uk } from "./uk";

describe("i18n", () => {
  describe("getDictionary", () => {
    it("returns Ukrainian dictionary by default", () => {
      const dict = getDictionary();
      expect(dict).toBe(uk);
    });

    it("returns Ukrainian dictionary for 'uk' locale", () => {
      const dict = getDictionary("uk");
      expect(dict).toBe(uk);
    });

    it("falls back to Ukrainian for unknown locale", () => {
      const dict = getDictionary("fr");
      expect(dict).toBe(uk);
    });
  });

  describe("getLocale / setLocale", () => {
    it("defaults to 'uk'", () => {
      expect(getLocale()).toBe("uk");
    });

    it("ignores setting unsupported locale", () => {
      setLocale("fr");
      expect(getLocale()).toBe("uk");
    });
  });

  describe("t()", () => {
    it("returns translation for a known key", () => {
      expect(t("nav.catalog")).toBe("Каталог");
    });

    it("returns translation for nested keys", () => {
      expect(t("footer.allRights")).toBe("Усі права захищені.");
    });

    it("returns key itself for unknown key", () => {
      expect(t("nonexistent.key")).toBe("nonexistent.key");
    });

    it("interpolates parameters", () => {
      const result = t("cart.minWeight", { min: 10, current: 5 });
      expect(result).toContain("10");
      expect(result).toContain("5");
    });

    it("keeps placeholder if parameter is missing", () => {
      const result = t("cart.minWeight", { min: 10 });
      expect(result).toContain("10");
      expect(result).toContain("{current}");
    });
  });

  describe("uk dictionary completeness", () => {
    it("has nav section", () => {
      expect(uk.nav.catalog).toBeTruthy();
      expect(uk.nav.lots).toBeTruthy();
      expect(uk.nav.about).toBeTruthy();
      expect(uk.nav.contacts).toBeTruthy();
      expect(uk.nav.cart).toBeTruthy();
      expect(uk.nav.wishlist).toBeTruthy();
    });

    it("has footer section", () => {
      expect(uk.footer.categories).toBeTruthy();
      expect(uk.footer.navigation).toBeTruthy();
      expect(uk.footer.contactsTitle).toBeTruthy();
      expect(uk.footer.description).toBeTruthy();
    });

    it("has catalog section", () => {
      expect(uk.catalog.title).toBeTruthy();
      expect(uk.catalog.noResults).toBeTruthy();
      expect(uk.catalog.clearFilters).toBeTruthy();
    });

    it("has cart section", () => {
      expect(uk.cart.title).toBeTruthy();
      expect(uk.cart.empty).toBeTruthy();
      expect(uk.cart.submit).toBeTruthy();
    });

    it("has order section", () => {
      expect(uk.order.confirmed).toBeTruthy();
      expect(uk.order.statusTitle).toBeTruthy();
    });

    it("has wishlist section", () => {
      expect(uk.wishlist.title).toBeTruthy();
      expect(uk.wishlist.empty).toBeTruthy();
    });

    it("has compare section", () => {
      expect(uk.compare.title).toBeTruthy();
      expect(uk.compare.clearAll).toBeTruthy();
    });

    it("has common section", () => {
      expect(uk.common.loading).toBeTruthy();
      expect(uk.common.error).toBeTruthy();
      expect(uk.common.back).toBeTruthy();
      expect(uk.common.next).toBeTruthy();
    });

    it("has home section", () => {
      expect(uk.home.heroDescription).toBeTruthy();
      expect(uk.home.ctaTitle).toBeTruthy();
    });
  });
});
