import { describe, it, expect } from "vitest";
import {
  bookLotSchema,
  canBook,
  canUnbook,
  isActiveReservation,
  type LotBookingState,
} from "./lot-booking";

const NOW = new Date("2026-05-20T12:00:00.000Z");

function lot(over: Partial<LotBookingState> = {}): LotBookingState {
  return {
    status: "free",
    reservedByUserId: null,
    reservedUntil: null,
    ...over,
  };
}

describe("isActiveReservation", () => {
  it("вільний лот (без reservedUntil) — бронь не активна", () => {
    expect(isActiveReservation(lot(), NOW)).toBe(false);
  });

  it("майбутня дата broни — активна", () => {
    expect(
      isActiveReservation(
        lot({ reservedUntil: new Date("2026-05-25T00:00:00.000Z") }),
        NOW,
      ),
    ).toBe(true);
  });

  it("дата броні дорівнює now — активна (включно)", () => {
    expect(isActiveReservation(lot({ reservedUntil: NOW }), NOW)).toBe(true);
  });

  it("минула дата броні — не активна (протермінована)", () => {
    expect(
      isActiveReservation(
        lot({ reservedUntil: new Date("2026-05-10T00:00:00.000Z") }),
        NOW,
      ),
    ).toBe(false);
  });
});

describe("canBook", () => {
  it("вільний лот можна забронювати", () => {
    expect(canBook(lot(), NOW)).toBe(true);
  });

  it("лот з протермінованою бронню можна перебронювати", () => {
    expect(
      canBook(
        lot({
          status: "reserved",
          reservedByUserId: "u2",
          reservedUntil: new Date("2026-05-10T00:00:00.000Z"),
        }),
        NOW,
      ),
    ).toBe(true);
  });

  it("лот із активною бронню НЕ можна забронювати", () => {
    expect(
      canBook(
        lot({
          status: "reserved",
          reservedByUserId: "u2",
          reservedUntil: new Date("2026-05-25T00:00:00.000Z"),
        }),
        NOW,
      ),
    ).toBe(false);
  });
});

describe("canUnbook", () => {
  it("свою активну бронь можна зняти", () => {
    expect(
      canUnbook(
        lot({
          status: "reserved",
          reservedByUserId: "u1",
          reservedUntil: new Date("2026-05-25T00:00:00.000Z"),
        }),
        "u1",
        NOW,
      ),
    ).toBe(true);
  });

  it("чужу активну бронь зняти НЕ можна", () => {
    expect(
      canUnbook(
        lot({
          status: "reserved",
          reservedByUserId: "u2",
          reservedUntil: new Date("2026-05-25T00:00:00.000Z"),
        }),
        "u1",
        NOW,
      ),
    ).toBe(false);
  });

  it("протерміновану свою бронь немає сенсу знімати — false", () => {
    expect(
      canUnbook(
        lot({
          status: "reserved",
          reservedByUserId: "u1",
          reservedUntil: new Date("2026-05-10T00:00:00.000Z"),
        }),
        "u1",
        NOW,
      ),
    ).toBe(false);
  });

  it("вільний лот — нічого знімати — false", () => {
    expect(canUnbook(lot(), "u1", NOW)).toBe(false);
  });
});

describe("bookLotSchema", () => {
  it("валідне тіло проходить", () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const res = bookLotSchema.safeParse({ clientId: "c1", until: future });
    expect(res.success).toBe(true);
  });

  it("порожній clientId → помилка", () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const res = bookLotSchema.safeParse({ clientId: "", until: future });
    expect(res.success).toBe(false);
  });

  it("дата в минулому → помилка", () => {
    const past = new Date("2020-01-01T00:00:00.000Z").toISOString();
    const res = bookLotSchema.safeParse({ clientId: "c1", until: past });
    expect(res.success).toBe(false);
  });

  it("невалідний формат дати → помилка", () => {
    const res = bookLotSchema.safeParse({
      clientId: "c1",
      until: "20-05-2026",
    });
    expect(res.success).toBe(false);
  });
});
