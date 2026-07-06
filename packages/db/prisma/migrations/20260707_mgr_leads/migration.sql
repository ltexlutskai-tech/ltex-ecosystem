-- Session 7.2: site registration → CRM lead (not full client). Additive.
CREATE TABLE IF NOT EXISTS "mgr_leads" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "city" TEXT,
  "region" TEXT,
  "source" TEXT NOT NULL DEFAULT 'site',
  "status" TEXT NOT NULL DEFAULT 'new',
  "note" TEXT,
  "converted_client_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mgr_leads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mgr_leads_status_created_at_idx"
  ON "mgr_leads" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "mgr_leads_phone_idx" ON "mgr_leads" ("phone");
