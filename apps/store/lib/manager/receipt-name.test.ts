import { describe, expect, it } from "vitest";
import {
  RECEIPT_GROUP_CODE,
  RECEIPT_GROUP_NAME,
  buildReceiptNameResolver,
  classifyCategoryNameChain,
  receiptCodeForName,
  resolveReceiptName,
  type CategoryNode,
} from "./receipt-name";

describe("classifyCategoryNameChain", () => {
  it("класифікує взуття (ВЗУТ/ОБУВ) як shoes", () => {
    expect(classifyCategoryNameChain(["Кросівки", "Взуття", "СЕКОНД"])).toBe(
      "shoes",
    );
    expect(classifyCategoryNameChain(["Обувь мужская"])).toBe("shoes");
  });

  it("класифікує іграшки/дім як home", () => {
    expect(classifyCategoryNameChain(["Іграшки", "СТОК"])).toBe("home");
    expect(classifyCategoryNameChain(["Подушки", "Товари для дому"])).toBe(
      "home",
    );
    expect(classifyCategoryNameChain(["Bric-a-Brac"])).toBe("home");
  });

  it("одяг (куртки тощо) — дефолт clothing", () => {
    expect(classifyCategoryNameChain(["Куртки", "СЕКОНД ХЕНД"])).toBe(
      "clothing",
    );
    expect(classifyCategoryNameChain([])).toBe("clothing");
  });

  it("взуття має пріоритет над домом", () => {
    // назви містять і взуттєве, і домашнє слово — перемагає shoes
    expect(classifyCategoryNameChain(["Взуття", "Текстиль"])).toBe("shoes");
  });

  it("нечутливий до регістру й зайвих пробілів", () => {
    expect(classifyCategoryNameChain(["  взуття  "])).toBe("shoes");
    expect(classifyCategoryNameChain(["товари   для   дому"])).toBe("home");
  });
});

describe("receiptCodeForName", () => {
  it("виводить код з готової назви", () => {
    expect(receiptCodeForName("Одяг вживаний")).toBe("1");
    expect(receiptCodeForName("Взуття вживане")).toBe("2");
    expect(receiptCodeForName("Товари для дому вживані")).toBe("3");
  });

  it("узгоджений з таблицями кодів/назв", () => {
    expect(receiptCodeForName(RECEIPT_GROUP_NAME.clothing)).toBe(
      RECEIPT_GROUP_CODE.clothing,
    );
    expect(receiptCodeForName(RECEIPT_GROUP_NAME.shoes)).toBe(
      RECEIPT_GROUP_CODE.shoes,
    );
    expect(receiptCodeForName(RECEIPT_GROUP_NAME.home)).toBe(
      RECEIPT_GROUP_CODE.home,
    );
  });
});

describe("resolveReceiptName", () => {
  const categories: CategoryNode[] = [
    { id: "root-second", name: "СЕКОНД ХЕНД", parentId: null },
    { id: "clothing", name: "Куртки", parentId: "root-second" },
    { id: "shoes-leaf", name: "Кросівки", parentId: "shoes-mid" },
    { id: "shoes-mid", name: "Взуття", parentId: "root-second" },
    { id: "home-leaf", name: "Іграшки", parentId: "root-second" },
  ];
  const resolver = buildReceiptNameResolver(categories);

  it("explicit receiptName перемагає й дає правильний код — усі 3 значення", () => {
    expect(
      resolveReceiptName(
        { receiptName: "Одяг вживаний", categoryId: "shoes-leaf" },
        resolver,
      ),
    ).toEqual({ name: "Одяг вживаний", code: "1" });

    expect(
      resolveReceiptName(
        { receiptName: "Взуття вживане", categoryId: "clothing" },
        resolver,
      ),
    ).toEqual({ name: "Взуття вживане", code: "2" });

    expect(
      resolveReceiptName(
        { receiptName: "Товари для дому вживані", categoryId: "clothing" },
        resolver,
      ),
    ).toEqual({ name: "Товари для дому вживані", code: "3" });
  });

  it("explicit кастомний рядок — використовується як назва, код виводиться", () => {
    expect(
      resolveReceiptName({ receiptName: "  Взуття дитяче б/у  " }, resolver),
    ).toEqual({ name: "Взуття дитяче б/у", code: "2" });

    expect(
      resolveReceiptName({ receiptName: "Постільна білизна" }, resolver),
    ).toEqual({ name: "Постільна білизна", code: "1" });
  });

  it("порожній/whitespace receiptName ігнорується → падіння на категорію", () => {
    expect(
      resolveReceiptName(
        { receiptName: "   ", categoryId: "shoes-leaf" },
        resolver,
      ),
    ).toEqual({ name: "Взуття вживане", code: "2" });

    expect(
      resolveReceiptName(
        { receiptName: null, categoryId: "clothing" },
        resolver,
      ),
    ).toEqual({ name: "Одяг вживаний", code: "1" });
  });

  it("класифікація за деревом категорій", () => {
    expect(resolveReceiptName({ categoryId: "shoes-leaf" }, resolver)).toEqual({
      name: "Взуття вживане",
      code: "2",
    });
    expect(resolveReceiptName({ categoryId: "home-leaf" }, resolver)).toEqual({
      name: "Товари для дому вживані",
      code: "3",
    });
    expect(resolveReceiptName({ categoryId: "clothing" }, resolver)).toEqual({
      name: "Одяг вживаний",
      code: "1",
    });
  });

  it("невідома/відсутня категорія → одяг (дефолт)", () => {
    expect(resolveReceiptName({ categoryId: "nope" }, resolver)).toEqual({
      name: "Одяг вживаний",
      code: "1",
    });
    expect(resolveReceiptName({ categoryId: null }, resolver)).toEqual({
      name: "Одяг вживаний",
      code: "1",
    });
    expect(resolveReceiptName({}, resolver)).toEqual({
      name: "Одяг вживаний",
      code: "1",
    });
  });
});

describe("buildReceiptNameResolver", () => {
  it("захист від циклів у ланцюжку категорій", () => {
    const cyclic: CategoryNode[] = [
      { id: "a", name: "Куртки", parentId: "b" },
      { id: "b", name: "Одяг", parentId: "a" },
    ];
    const resolver = buildReceiptNameResolver(cyclic);
    // не зависає, дефолт clothing (жодного взуттєвого/домашнього слова)
    expect(resolver("a")).toEqual({
      group: "clothing",
      name: "Одяг вживаний",
      code: "1",
    });
  });

  it("цикл із взуттєвим словом усе одно класифікується", () => {
    const cyclic: CategoryNode[] = [
      { id: "a", name: "Кросівки", parentId: "b" },
      { id: "b", name: "Взуття", parentId: "a" },
    ];
    const resolver = buildReceiptNameResolver(cyclic);
    expect(resolver("a").group).toBe("shoes");
  });

  it("мемоізація повертає стабільний (той самий) результат", () => {
    const categories: CategoryNode[] = [
      { id: "root", name: "Взуття", parentId: null },
      { id: "leaf", name: "Кеди", parentId: "root" },
    ];
    const resolver = buildReceiptNameResolver(categories);
    const first = resolver("leaf");
    const second = resolver("leaf");
    expect(first).toBe(second); // референсна рівність — з кешу
    expect(first).toEqual({
      group: "shoes",
      name: "Взуття вживане",
      code: "2",
    });
  });
});
