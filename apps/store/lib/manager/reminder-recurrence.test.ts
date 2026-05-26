import { describe, it, expect } from "vitest";
import {
  isRecurring,
  nextOccurrence,
  recurrenceHint,
} from "./reminder-recurrence";

describe("isRecurring", () => {
  it("daily/weekly/monthly/yearly → true", () => {
    expect(isRecurring("daily")).toBe(true);
    expect(isRecurring("weekly")).toBe(true);
    expect(isRecurring("monthly")).toBe(true);
    expect(isRecurring("yearly")).toBe(true);
  });
  it("none/event → false", () => {
    expect(isRecurring("none")).toBe(false);
    expect(isRecurring("event")).toBe(false);
  });
});

describe("nextOccurrence", () => {
  it("daily adds one day, keeps time", () => {
    const from = new Date(2026, 4, 10, 9, 30); // 10 May 2026 09:30 local
    const next = nextOccurrence(from, "daily");
    expect(next?.getDate()).toBe(11);
    expect(next?.getMonth()).toBe(4);
    expect(next?.getHours()).toBe(9);
    expect(next?.getMinutes()).toBe(30);
  });

  it("weekly adds seven days", () => {
    const from = new Date(2026, 4, 10, 14, 0);
    const next = nextOccurrence(from, "weekly");
    expect(next?.getDate()).toBe(17);
    expect(next?.getMonth()).toBe(4);
  });

  it("monthly adds one month, same day-of-month", () => {
    const from = new Date(2026, 0, 15, 8, 0); // 15 Jan
    const next = nextOccurrence(from, "monthly");
    expect(next?.getMonth()).toBe(1); // Feb
    expect(next?.getDate()).toBe(15);
  });

  it("monthly clamps end-of-month (31 Jan → 28 Feb 2026)", () => {
    const from = new Date(2026, 0, 31, 10, 0); // 31 Jan 2026 (non-leap)
    const next = nextOccurrence(from, "monthly");
    expect(next?.getMonth()).toBe(1); // Feb
    expect(next?.getDate()).toBe(28);
  });

  it("monthly clamps to leap-year Feb (31 Jan 2028 → 29 Feb)", () => {
    const from = new Date(2028, 0, 31, 10, 0); // 2028 is leap
    const next = nextOccurrence(from, "monthly");
    expect(next?.getMonth()).toBe(1);
    expect(next?.getDate()).toBe(29);
  });

  it("monthly rolls over December → January next year", () => {
    const from = new Date(2026, 11, 10, 0, 0); // 10 Dec 2026
    const next = nextOccurrence(from, "monthly");
    expect(next?.getFullYear()).toBe(2027);
    expect(next?.getMonth()).toBe(0); // Jan
    expect(next?.getDate()).toBe(10);
  });

  it("yearly adds one year", () => {
    const from = new Date(2026, 5, 1, 12, 0);
    const next = nextOccurrence(from, "yearly");
    expect(next?.getFullYear()).toBe(2027);
    expect(next?.getMonth()).toBe(5);
    expect(next?.getDate()).toBe(1);
  });

  it("yearly clamps 29 Feb (leap) → 28 Feb (non-leap)", () => {
    const from = new Date(2028, 1, 29, 9, 0); // 29 Feb 2028
    const next = nextOccurrence(from, "yearly");
    expect(next?.getFullYear()).toBe(2029);
    expect(next?.getMonth()).toBe(1);
    expect(next?.getDate()).toBe(28);
  });

  it("none/event → null", () => {
    const from = new Date(2026, 4, 10, 9, 0);
    expect(nextOccurrence(from, "none")).toBeNull();
    expect(nextOccurrence(from, "event")).toBeNull();
  });
});

describe("recurrenceHint", () => {
  it("daily hint", () => {
    const d = new Date(2026, 4, 10, 9, 5);
    expect(recurrenceHint(d, "daily")).toBe("Кожен день о 09:05");
  });

  it("weekly hint uses Ukrainian weekday (accusative)", () => {
    const d = new Date(2026, 4, 11, 14, 30); // 11 May 2026 = Monday
    expect(recurrenceHint(d, "weekly")).toBe("Кожен понеділок о 14:30");
  });

  it("monthly hint uses day number", () => {
    const d = new Date(2026, 4, 17, 8, 0);
    expect(recurrenceHint(d, "monthly")).toBe("Кожен 17 день місяця о 08:00");
  });

  it("yearly hint uses genitive month name", () => {
    const d = new Date(2026, 2, 8, 7, 15); // 8 Mar
    expect(recurrenceHint(d, "yearly")).toBe("Кожен рік 8 березня о 07:15");
  });

  it("none/event → null", () => {
    const d = new Date(2026, 4, 10, 9, 0);
    expect(recurrenceHint(d, "none")).toBeNull();
    expect(recurrenceHint(d, "event")).toBeNull();
  });
});
