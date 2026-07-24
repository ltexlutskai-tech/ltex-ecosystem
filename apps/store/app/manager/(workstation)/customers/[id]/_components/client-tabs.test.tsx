import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

describe("ClientTabs — горизонтальні вкладки + «Ще» + M1.3f foreign", () => {
  it("mine view: 7 основних вкладок у стрічці + кнопка «Ще»", () => {
    render(<ClientTabs {...PANELS} isForeign={false} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(7);
    const labels = tabs.map((b) => b.textContent?.trim());
    expect(labels).toContain("Історія");
    expect(labels).toContain("Нагадування");
    expect(labels).toContain("Реквізити");
    expect(labels).toContain("Рухи боргу");
    expect(screen.getByText("Ще")).toBeDefined();
  });

  it("mine view: «Ще» відкриває Презентації / Іст. презентацій / Ключові слова", () => {
    render(<ClientTabs {...PANELS} />);
    fireEvent.click(screen.getByText("Ще"));
    const labels = screen.getAllByRole("tab").map((b) => b.textContent?.trim());
    expect(labels).toContain("Презентації");
    expect(labels).toContain("Іст. презентацій");
    expect(labels).toContain("Ключові слова");
    // 7 основних + 3 у меню = 10
    expect(screen.getAllByRole("tab")).toHaveLength(10);
  });

  it("дефолтна активна вкладка — Історія", () => {
    render(<ClientTabs {...PANELS} />);
    expect(screen.getByText("history-panel")).toBeDefined();
  });

  it("вибір вкладки перемикає панель", () => {
    render(<ClientTabs {...PANELS} />);
    fireEvent.click(screen.getByRole("tab", { name: "Реквізити" }));
    expect(screen.getByText("requisites-panel")).toBeDefined();
  });

  it("вкладок «Соцмережі та месенджери» / «Viber» немає", () => {
    render(<ClientTabs {...PANELS} />);
    fireEvent.click(screen.getByText("Ще"));
    const labels = new Set(
      screen.getAllByRole("tab").map((b) => b.textContent?.trim() ?? ""),
    );
    expect(labels.has("Соцмережі та месенджери")).toBe(false);
    expect(labels.has("Viber")).toBe(false);
  });

  it("overdue-бейдж на «Нагадування» коли є прострочені", () => {
    render(<ClientTabs {...PANELS} overdueRemindersCount={3} />);
    const remindersTab = screen.getByRole("tab", { name: /Нагадування/ });
    expect(remindersTab.textContent).toContain("3");
  });

  it("foreign view: рівно 4 вкладки у порядку розділів, без «Ще»", () => {
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
    expect(screen.queryByText("Ще")).toBeNull();
  });

  it("foreign view: приховані вкладки не у DOM", () => {
    render(<ClientTabs {...PANELS} isForeign={true} />);
    const labels = new Set(
      screen.getAllByRole("tab").map((b) => b.textContent?.trim() ?? ""),
    );
    expect(labels.has("Історія")).toBe(false);
    expect(labels.has("Нагадування")).toBe(false);
    expect(labels.has("Рухи боргу")).toBe(false);
    expect(labels.has("Презентації")).toBe(false);
    expect(labels.has("Ключові слова")).toBe(false);
  });

  it("foreign view: початкова активна вкладка — Реквізити", () => {
    render(<ClientTabs {...PANELS} isForeign={true} />);
    expect(screen.getByText("requisites-panel")).toBeDefined();
  });
});
