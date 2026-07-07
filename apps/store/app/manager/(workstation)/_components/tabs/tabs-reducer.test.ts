import { describe, it, expect } from "vitest";
import { tabsReducer, type TabsState } from "./tabs-context";

const empty: TabsState = { tabs: [], activeId: null };

describe("tabsReducer", () => {
  it("opens a new tab and activates it", () => {
    const s = tabsReducer(empty, {
      type: "open",
      url: "/manager/orders",
      id: "a",
    });
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0]).toMatchObject({ id: "a", url: "/manager/orders" });
    expect(s.tabs[0]?.label).toBe("Замовлення");
    expect(s.activeId).toBe("a");
  });

  it("focuses an existing tab instead of duplicating (duplicate !== true)", () => {
    let s = tabsReducer(empty, {
      type: "open",
      url: "/manager/orders",
      id: "a",
    });
    s = tabsReducer(s, { type: "open", url: "/manager/sales", id: "b" });
    expect(s.activeId).toBe("b");
    // re-open orders → should focus "a", not add a new tab
    s = tabsReducer(s, { type: "open", url: "/manager/orders", id: "c" });
    expect(s.tabs).toHaveLength(2);
    expect(s.activeId).toBe("a");
  });

  it("opens a duplicate tab when duplicate === true", () => {
    let s = tabsReducer(empty, {
      type: "open",
      url: "/manager/orders",
      id: "a",
    });
    s = tabsReducer(s, {
      type: "open",
      url: "/manager/orders",
      id: "b",
      duplicate: true,
    });
    expect(s.tabs).toHaveLength(2);
    expect(s.tabs.map((t) => t.url)).toEqual([
      "/manager/orders",
      "/manager/orders",
    ]);
    expect(s.activeId).toBe("b");
  });

  it("closing the active tab activates the right neighbour", () => {
    let s = empty;
    s = tabsReducer(s, { type: "open", url: "/manager/orders", id: "a" });
    s = tabsReducer(s, { type: "open", url: "/manager/sales", id: "b" });
    s = tabsReducer(s, { type: "open", url: "/manager/payments", id: "c" });
    // focus middle, then close it → right neighbour "c" becomes active
    s = tabsReducer(s, { type: "focus", id: "b" });
    s = tabsReducer(s, { type: "close", id: "b", dashboardId: "dash" });
    expect(s.tabs.map((t) => t.id)).toEqual(["a", "c"]);
    expect(s.activeId).toBe("c");
  });

  it("closing the last (rightmost) active tab falls back to left neighbour", () => {
    let s = empty;
    s = tabsReducer(s, { type: "open", url: "/manager/orders", id: "a" });
    s = tabsReducer(s, { type: "open", url: "/manager/sales", id: "b" });
    // "b" active (rightmost) → close → "a"
    s = tabsReducer(s, { type: "close", id: "b", dashboardId: "dash" });
    expect(s.activeId).toBe("a");
  });

  it("closing the only tab opens a fresh dashboard tab", () => {
    let s = tabsReducer(empty, {
      type: "open",
      url: "/manager/orders",
      id: "a",
    });
    s = tabsReducer(s, { type: "close", id: "a", dashboardId: "dash" });
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0]).toMatchObject({ id: "dash", url: "/manager" });
    expect(s.tabs[0]?.label).toBe("Робочий стіл");
    expect(s.activeId).toBe("dash");
  });

  it("closing a non-active tab keeps the active one", () => {
    let s = empty;
    s = tabsReducer(s, { type: "open", url: "/manager/orders", id: "a" });
    s = tabsReducer(s, { type: "open", url: "/manager/sales", id: "b" });
    s = tabsReducer(s, { type: "focus", id: "a" });
    s = tabsReducer(s, { type: "close", id: "b", dashboardId: "dash" });
    expect(s.activeId).toBe("a");
    expect(s.tabs).toHaveLength(1);
  });

  it("rename updates only the matching tab label", () => {
    let s = tabsReducer(empty, {
      type: "open",
      url: "/manager/orders/5",
      id: "a",
    });
    s = tabsReducer(s, { type: "rename", id: "a", label: "Замовлення №5" });
    expect(s.tabs[0]?.label).toBe("Замовлення №5");
  });

  it("hydrate replaces the whole state", () => {
    const hydrated: TabsState = {
      tabs: [{ id: "x", url: "/manager/prices", label: "Прайс" }],
      activeId: "x",
    };
    const s = tabsReducer(empty, { type: "hydrate", state: hydrated });
    expect(s).toEqual(hydrated);
  });

  it("setSplit pins an existing tab to the right pane and null clears it", () => {
    let s = empty;
    s = tabsReducer(s, { type: "open", url: "/manager/orders", id: "a" });
    s = tabsReducer(s, { type: "open", url: "/manager/sales", id: "b" });
    s = tabsReducer(s, { type: "setSplit", id: "a" });
    expect(s.splitId).toBe("a");
    s = tabsReducer(s, { type: "setSplit", id: null });
    expect(s.splitId).toBeNull();
  });

  it("setSplit ignores unknown tab ids", () => {
    let s = tabsReducer(empty, {
      type: "open",
      url: "/manager/orders",
      id: "a",
    });
    s = tabsReducer(s, { type: "setSplit", id: "ghost" });
    expect(s.splitId ?? null).toBeNull();
  });

  it("closing the split tab clears splitId", () => {
    let s = empty;
    s = tabsReducer(s, { type: "open", url: "/manager/orders", id: "a" });
    s = tabsReducer(s, { type: "open", url: "/manager/sales", id: "b" });
    s = tabsReducer(s, { type: "setSplit", id: "a" });
    s = tabsReducer(s, { type: "close", id: "a", dashboardId: "dash" });
    expect(s.splitId).toBeNull();
    expect(s.tabs.map((t) => t.id)).toEqual(["b"]);
  });

  it("closing a non-split tab keeps splitId", () => {
    let s = empty;
    s = tabsReducer(s, { type: "open", url: "/manager/orders", id: "a" });
    s = tabsReducer(s, { type: "open", url: "/manager/sales", id: "b" });
    s = tabsReducer(s, { type: "open", url: "/manager/payments", id: "c" });
    s = tabsReducer(s, { type: "setSplit", id: "a" });
    s = tabsReducer(s, { type: "close", id: "b", dashboardId: "dash" });
    expect(s.splitId).toBe("a");
  });

  it("closeOthers keeps only the given tab and activates it", () => {
    let s = empty;
    s = tabsReducer(s, { type: "open", url: "/manager/orders", id: "a" });
    s = tabsReducer(s, { type: "open", url: "/manager/sales", id: "b" });
    s = tabsReducer(s, { type: "open", url: "/manager/payments", id: "c" });
    s = tabsReducer(s, { type: "setSplit", id: "b" });
    s = tabsReducer(s, { type: "closeOthers", id: "a" });
    expect(s.tabs.map((t) => t.id)).toEqual(["a"]);
    expect(s.activeId).toBe("a");
    // Закріплена праворуч вкладка закрилась — розділення знято.
    expect(s.splitId).toBeNull();
  });
});
