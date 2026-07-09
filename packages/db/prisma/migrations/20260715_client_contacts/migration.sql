-- ТЗ 8.0 E2: контактні особи клієнта (← 1С Catalog.КонтактныеЛицаКонтрагентов).
CREATE TABLE IF NOT EXISTS "mgr_client_contacts" (
  "id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "full_name" TEXT NOT NULL,
  "position" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "comment" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "mgr_client_contacts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mgr_client_contacts_client_id_idx" ON "mgr_client_contacts" ("client_id");
DO $$ BEGIN
  ALTER TABLE "mgr_client_contacts" ADD CONSTRAINT "mgr_client_contacts_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "mgr_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
