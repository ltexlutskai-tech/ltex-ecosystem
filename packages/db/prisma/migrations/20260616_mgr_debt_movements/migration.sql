DO $$ BEGIN
  CREATE TYPE "mgr_debt_movement_kind" AS ENUM ('opening', 'sale', 'payment', 'correction');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "mgr_debt_movements" (
  "id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "amount_eur" DECIMAL(12,2) NOT NULL,
  "kind" "mgr_debt_movement_kind" NOT NULL,
  "source_type" TEXT,
  "source_id" TEXT,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mgr_debt_movements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mgr_debt_movement_source" ON "mgr_debt_movements" ("kind", "source_type", "source_id");
CREATE INDEX IF NOT EXISTS "mgr_debt_movements_client_id_occurred_at_idx" ON "mgr_debt_movements" ("client_id", "occurred_at");

DO $$ BEGIN
  ALTER TABLE "mgr_debt_movements" ADD CONSTRAINT "mgr_debt_movements_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "mgr_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
