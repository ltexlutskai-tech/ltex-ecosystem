import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ClientTabs } from "./client-tabs";

afterEach(() => cleanup());
beforeEach(() => {
  // Reset URL hash між тестами щоб initial useEffect не leak-ив стан.
  if (typeof window !== "undefined") {
    window.history.replaceState(null, "", window.location.pathname);
  }
});

const PANELS = {
  requisites: <div>requisites-panel</div>,
  assortment: <div>assortment-panel</div>,
  presentations: <div>presentations-panel</div>,
  history: <div>history-panel</div>,
  salesHistory: <div>sales-history-panel</div>,
  orders: <div>orders-panel</div>,
  reminders: <div>reminders-panel</div>,
  presentationHistory: <div>presentation-history-panel</div>,
  keywords: <div>keywords-panel</div>,
  debtMovements: <div>debt-movements-panel</div>,
};

describe("ClientTabs — CRM групи + M1.3f foreign visibility filtering", () => {
  it("mine view: рендерить усі 10 tabs (без Viber і без Соцмереж — вони у шапці)", () => {
    render(<ClientTabs {...PANELS} isForeign={false} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(10);
  });

  it("admin view (default isForeign=false): рендерить усі 10 tabs", () => {
    render(<ClientTabs {...PANELS} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(10);
  });

  it("вкладки «Соцмережі та месенджери» більше немає (перенесено в шапку)", () => {
    render(<ClientTabs {...PANELS} />);
    const tabs = screen.getAllByRole("tab");
    const labels = new Set(tabs.map((b) => b.textContent?.trim() ?? ""));
    expect(labels.has("Соцмережі та месенджери")).toBe(false);
  });

  it("Viber вкладки більше немає", () => {
    render(<ClientTabs {...PANELS} />);
    const tabs = screen.getAllByRole("tab");
    const labels = new Set(tabs.map((b) => b.textContent?.trim() ?? ""));
    expect(labels.has("Viber")).toBe(false);
  });

  it("foreign view: вкладка «Рухи боргу» прихована", () => {
    render(<ClientTabs {...PANELS} isForeign={true} />);
    const tabs = screen.getAllByRole("tab");
    const labels = new Set(tabs.map((b) => b.textContent?.trim() ?? ""));
    expect(labels.has("Рухи боргу")).toBe(false);
  });

  it("foreign view: лише 4 tabs у порядку розділів", () => {
    render(<ClientTabs {...PANELS} isForeign={true} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    const labels = tabs.map((b) => b.textContent?.trim());
    expect(labels).toEqual([
      "Реквізити",
      "Історія продаж",
      "Асортимент",
      "Замовлення",
    ]);
  });

  it("foreign view: hidden tabs не у DOM", () => {
    render(<ClientTabs {...PANELS} isForeign={true} />);
    const tabs = screen.getAllByRole("tab");
    const labels = new Set(tabs.map((b) => b.textContent?.trim() ?? ""));
    expect(labels.has("Презентації")).toBe(false);
    expect(labels.has("Історія")).toBe(false);
    expect(labels.has("Нагадування")).toBe(false);
    expect(labels.has("Іст. презентацій")).toBe(false);
    expect(labels.has("Соцмережі та месенджери")).toBe(false);
    expect(labels.has("Ключові слова")).toBe(false);
  });

  it("foreign view: початковий active tab — Реквізити", () => {
    render(<ClientTabs {...PANELS} isForeign={true} />);
    expect(screen.getByText("requisites-panel")).toBeDefined();
  });
});
