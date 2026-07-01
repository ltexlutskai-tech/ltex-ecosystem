-- Виправлення часткових unique-індексів code_1c на full-unique.
--
-- Проблема: міграція 20260604_warehouse_receiving створила часткові unique-індекси
--   CREATE UNIQUE INDEX ... ON "t" ("code_1c") WHERE "code_1c" IS NOT NULL
-- для warehouses / suppliers / receivings. Prisma-схема декларує ці поля просто
-- як @unique (full-index). Prisma `upsert` компілюється в
--   INSERT ... ON CONFLICT ("code_1c") DO UPDATE
-- і Postgres НЕ вміє матчити ON CONFLICT на ЧАСТКОВИЙ індекс → помилка
-- (PrismaClientUnknownRequestError) при імпорті складів з 1С.
--
-- Рішення: перестворити ці три індекси як full-unique. На nullable-колонці
-- Postgres усе одно вважає NULL-значення різними, тож множинні NULL лишаються
-- дозволені (поведінка не змінюється). Дублікатів серед не-NULL немає —
-- частковий unique їх уже не допускав, тож перестворення безпечне.
-- Additive + idempotent.

DROP INDEX IF EXISTS "warehouses_code_1c_key";
CREATE UNIQUE INDEX IF NOT EXISTS "warehouses_code_1c_key" ON "warehouses" ("code_1c");

DROP INDEX IF EXISTS "suppliers_code_1c_key";
CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_code_1c_key" ON "suppliers" ("code_1c");

DROP INDEX IF EXISTS "receivings_code_1c_key";
CREATE UNIQUE INDEX IF NOT EXISTS "receivings_code_1c_key" ON "receivings" ("code_1c");
