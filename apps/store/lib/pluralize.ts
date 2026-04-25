export function pluralizeUk(
  count: number,
  forms: readonly [string, string, string],
): string {
  const abs = Math.abs(count);
  const mod10 = abs % 10;
  const mod100 = abs % 100;

  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
    return forms[1];
  return forms[2];
}

export const PRODUCT_FORMS = ["товар", "товари", "товарів"] as const;

export function productsLabel(count: number): string {
  return `${count} ${pluralizeUk(count, PRODUCT_FORMS)}`;
}
