import type { Prisma } from "@ltex/db";

/**
 * Генерація людського номера замовлення (7.3).
 *
 * Історичні замовлення мають номер 1С (`number1C`, напр. "L0000002477").
 * Нові замовлення (менеджерка + сайт) продовжують ту саму нумерацію:
 * MAX(числова частина L-номерів) + 1, падінг до 10 цифр — як авто-code1C
 * товарів у 7.2. Викликається всередині транзакції створення замовлення.
 */
export async function nextOrderNumber1C(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ max_num: bigint | null }>>`
    SELECT MAX(CAST(SUBSTRING(number_1c FROM 2) AS BIGINT)) AS max_num
    FROM orders
    WHERE number_1c ~ '^L[0-9]+$'
  `;
  const maxNum = rows[0]?.max_num != null ? Number(rows[0].max_num) : 0;
  return `L${String(maxNum + 1).padStart(10, "0")}`;
}
