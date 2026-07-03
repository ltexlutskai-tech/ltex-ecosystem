import { describe, it, expect } from "vitest";
import {
  mapUnitRow,
  mapRegionRow,
  mapCityRow,
  mapTradeAgentRow,
  mapViberContactRow,
  resolveMergedProductId,
} from "./import-1c-historical";

// Синтетичні 1С-рядки (MSSQL). binary(16) _IDRRef передаємо як hex-рядок
// (bufToHex приймає і Buffer, і "0x.."/hex). Порожнє посилання = усі нулі.
const HEX_A = "1a2b3c4d5e6f70819293a4b5c6d7e8f9";
const HEX_REGION = "ffeeddccbbaa99887766554433221100";
const ZERO_REF = "00000000000000000000000000000000";

describe("import dictionaries-full — pure mappers", () => {
  it("mapUnitRow: декодує code/name/coefficient", () => {
    const r = mapUnitRow({
      _IDRRef: HEX_A,
      _Code: "  796  ",
      _Description: "  шт  ",
      _Fld5990: 1,
    });
    expect(r).toEqual({
      code1C: HEX_A,
      code: "796",
      name: "шт",
      coefficient: "1",
    });
  });

  it("mapUnitRow: порожнє _IDRRef → null", () => {
    expect(mapUnitRow({ _IDRRef: ZERO_REF, _Description: "кг" })).toBeNull();
  });

  it("mapUnitRow: порожня назва → fallback на hex; coefficient null", () => {
    const r = mapUnitRow({ _IDRRef: HEX_A, _Code: null, _Description: "" });
    expect(r?.name).toBe(HEX_A);
    expect(r?.code).toBeNull();
    expect(r?.coefficient).toBeNull();
  });

  it("mapRegionRow: декодує область", () => {
    const r = mapRegionRow({
      _IDRRef: HEX_REGION,
      _Code: "07",
      _Description: "Волинська обл.",
    });
    expect(r).toEqual({
      code1C: HEX_REGION,
      code: "07",
      name: "Волинська обл.",
    });
  });

  it("mapRegionRow: порожнє посилання → null", () => {
    expect(mapRegionRow({ _IDRRef: ZERO_REF })).toBeNull();
  });

  it("mapCityRow: декодує місто + hex області-власника", () => {
    const r = mapCityRow({
      _IDRRef: HEX_A,
      _OwnerIDRRef: HEX_REGION,
      _Code: "001",
      _Description: "Луцьк",
    });
    expect(r).toEqual({
      code1C: HEX_A,
      code: "001",
      name: "Луцьк",
      regionCode1C: HEX_REGION,
    });
  });

  it("mapCityRow: порожній власник → regionCode1C null", () => {
    const r = mapCityRow({
      _IDRRef: HEX_A,
      _OwnerIDRRef: ZERO_REF,
      _Description: "Місто без області",
    });
    expect(r?.regionCode1C).toBeNull();
  });

  it("mapTradeAgentRow: декодує ПІБ агента", () => {
    const r = mapTradeAgentRow({
      _IDRRef: HEX_A,
      _Code: "А-12",
      _Description: "Бойко І.",
    });
    expect(r).toEqual({ code1C: HEX_A, code: "А-12", name: "Бойко І." });
  });

  it("mapTradeAgentRow: порожнє посилання → null", () => {
    expect(mapTradeAgentRow({ _IDRRef: ZERO_REF })).toBeNull();
  });

  it("mapViberContactRow: декодує телефон/статус з кастомними колонками", () => {
    const r = mapViberContactRow(
      {
        _IDRRef: HEX_A,
        phone: "+380671234567",
        sub: new Date(Date.UTC(2025, 0, 15)),
        client: HEX_REGION,
        status: "active",
      },
      { phone: "phone", subscribed: "sub", client: "client", status: "status" },
    );
    expect(r?.code1C).toBe(HEX_A);
    expect(r?.phone).toBe("+380671234567");
    expect(r?.clientCode1C).toBe(HEX_REGION);
    expect(r?.dialogStatus).toBe("active");
    expect(r?.subscribedAt?.getUTCFullYear()).toBe(2025);
  });

  it("mapViberContactRow: без телефону → null", () => {
    const r = mapViberContactRow(
      { _IDRRef: HEX_A, phone: null },
      { phone: "phone", subscribed: "sub", client: "client", status: "status" },
    );
    expect(r).toBeNull();
  });
});

// ─── Сесія 7.1 — резолв товару з мапою злиттів дублікатів ────────────────────

describe("resolveMergedProductId — резолв з урахуванням злиттів", () => {
  const products = new Map<string, { id: string; code1C: string | null }>([
    ["oldhex", { id: "(pending)", code1C: "OLD" }],
    ["curhex", { id: "prod_survivor", code1C: "CUR" }],
    ["freshhex", { id: "prod_fresh", code1C: "FRESH" }],
  ]);
  const merged = new Map<string, string>([["oldhex", "prod_survivor"]]);

  it("null hex → null", () => {
    expect(resolveMergedProductId(null, products, merged)).toBeNull();
  });

  it("злитий старий hex → survivor id (навіть якщо у словнику (pending))", () => {
    expect(resolveMergedProductId("oldhex", products, merged)).toBe(
      "prod_survivor",
    );
  });

  it("звичайний hex → id зі словника", () => {
    expect(resolveMergedProductId("freshhex", products, merged)).toBe(
      "prod_fresh",
    );
  });

  it("(pending) без злиття → null", () => {
    const p = new Map([["h", { id: "(pending)", code1C: "X" }]]);
    expect(resolveMergedProductId("h", p, new Map())).toBeNull();
  });

  it("невідомий hex → null", () => {
    expect(resolveMergedProductId("nope", products, merged)).toBeNull();
  });
});
