/**
 * Переклад помилок Нової Пошти (API повертає англійською) на зрозумілу
 * українську з підказкою, ЩО треба змінити — щоб склад/менеджер розумів.
 *
 * Невідомі повідомлення показуємо як «Нова Пошта: <оригінал>» (щоб не втратити
 * інформацію), відомі — перекладаємо з рекомендацією.
 */

interface Rule {
  test: RegExp;
  message: string;
}

const RULES: Rule[] = [
  {
    // Ручна обробка + важке місце у звичайному відділенні.
    test: /special\s*cargo.*weight|not\s*match.*weight/i,
    message:
      "Ручна обробка: оберіть ВАНТАЖНЕ відділення отримувача — важке місце не приймає звичайне відділення (постав галочку «лише вантажні» у виборі відділення).",
  },
  {
    test: /afterpayment.*(unavailable|not\s*available|недоступ)|контроль\s*оплат/i,
    message:
      "«Контроль оплати» недоступний на цьому ключі Нової Пошти — потрібен договір NovaPay/новий ключ. Зверніться до адміністратора.",
  },
  {
    test: /(pislyaplata|післяплат).*(unavailable|недоступ)/i,
    message:
      "Послуга накладеного платежу недоступна на цьому ключі Нової Пошти. Зверніться до адміністратора.",
  },
  {
    test: /(dimension|size|width|length|height).*(120|exceed|more)|120\s*cm/i,
    message:
      "Габарити місця завеликі: для ручної обробки максимум 120 см на сторону. Зменшіть розміри або приберіть ручну обробку.",
  },
  {
    test: /weight.*(exceed|more|max|limit)|max.*weight/i,
    message:
      "Перевищено допустиму вагу відділення. Оберіть вантажне відділення або зменшіть вагу місця.",
  },
  {
    test: /(recipient|cityrecipient).*(city|address|warehouse|not\s*found|empty)/i,
    message:
      "Проблема з відділенням/адресою отримувача — оберіть коректне відділення Нової Пошти у реалізації.",
  },
  {
    test: /(recipient|contact).*(phone|number).*(invalid|empty|not)/i,
    message:
      "Некоректний телефон отримувача — перевірте номер у реалізації (формат +380…).",
  },
  {
    test: /(sender|senderaddress).*(not\s*found|empty|invalid)/i,
    message:
      "Проблема з відправником Нової Пошти — перевірте налаштування відправника (адміністратор).",
  },
  {
    test: /(api\s*key|apikey).*(invalid|not\s*found|empty)|invalid\s*api/i,
    message: "Невірний ключ API Нової Пошти — зверніться до адміністратора.",
  },
  {
    test: /cost.*(invalid|empty|less|min)/i,
    message: "Некоректна оголошена цінність — перевірте суму у реалізації.",
  },
  {
    test: /seats?\s*amount|seat.*count|кільк.*місц/i,
    message:
      "Невідповідність кількості місць — перевірте перелік місць відправлення.",
  },
];

/** Перекладає повідомлення помилки НП на українську з підказкою. */
export function translateNpError(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return "Невідома помилка Нової Пошти.";
  for (const rule of RULES) {
    if (rule.test.test(text)) return rule.message;
  }
  // Уже українською (наш власний текст) — віддаємо як є.
  if (/[а-яіїєґ]/i.test(text)) return text;
  return `Нова Пошта: ${text}`;
}
