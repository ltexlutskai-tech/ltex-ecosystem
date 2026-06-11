CREATE TABLE IF NOT EXISTS "mgr_route_sheet_expenses" (
  "id" TEXT NOT NULL,
  "route_sheet_id" TEXT NOT NULL,
  "article_name" TEXT,
  "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  CONSTRAINT "mgr_route_sheet_expenses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mgr_route_sheet_expenses_route_sheet_id_idx" ON "mgr_route_sheet_expenses"("route_sheet_id");
DO $$ BEGIN
  ALTER TABLE "mgr_route_sheet_expenses" ADD CONSTRAINT "mgr_route_sheet_expenses_route_sheet_id_fkey"
    FOREIGN KEY ("route_sheet_id") REFERENCES "mgr_route_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
