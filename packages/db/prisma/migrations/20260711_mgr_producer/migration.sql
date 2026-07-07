-- Session 7.2: producers dictionary (Виробники) — щоб значення не різнились.
CREATE TABLE IF NOT EXISTS "mgr_producers" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "mgr_producers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "mgr_producers_code_key"
  ON "mgr_producers" ("code");
