-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 20260618_category_code1c                                                  ║
-- ║                                                                          ║
-- ║ Сесія 5.7 — дерево категорій з 1С (групи Номенклатури) + каркас доступів  ║
-- ║ за групами товарів.                                                       ║
-- ║                                                                          ║
-- ║   • Category.code1C        — звʼязок із 1С-групою (hex(_IDRRef) папки      ║
-- ║                              _Reference76, _Folder=0). UNIQUE.            ║
-- ║   • Category.hiddenForRoles — deny-list ролей (серверний фільтр прайсу/     ║
-- ║                              картки/вітрини; порожній = видно всім).       ║
-- ║                                                                          ║
-- ║ Additive + idempotent (можна повторно застосовувати).                     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "code_1c" TEXT;
ALTER TABLE "categories"
  ADD COLUMN IF NOT EXISTS "hidden_for_roles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- UNIQUE по code_1c (тільки не-NULL значення індексуються).
CREATE UNIQUE INDEX IF NOT EXISTS "categories_code_1c_key" ON "categories" ("code_1c");
