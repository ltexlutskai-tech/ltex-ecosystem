-- Мішки відеозавдання (по одному ШК на одиницю)
CREATE TABLE IF NOT EXISTS "mgr_video_task_bags" (
  "id" TEXT NOT NULL,
  "task_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "lot_id" TEXT,
  "barcode" TEXT,
  "weight" DOUBLE PRECISION,
  "units_count" TEXT,
  "unit_weight" TEXT,
  "lot_weight_kg" DOUBLE PRECISION,
  "video_url" TEXT,
  "youtube_description" TEXT,
  "brought_by_user_id" TEXT,
  "brought_by_name" TEXT,
  "brought_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mgr_video_task_bags_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mgr_video_task_bags_task_id_idx"
  ON "mgr_video_task_bags"("task_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'mgr_video_task_bags_task_id_fkey'
  ) THEN
    ALTER TABLE "mgr_video_task_bags"
      ADD CONSTRAINT "mgr_video_task_bags_task_id_fkey"
      FOREIGN KEY ("task_id") REFERENCES "mgr_video_tasks"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Бекфіл: наявні завдання, у яких уже прикріплено мішок (lot_id), переносимо у
-- один рядок-мішок, щоб нова логіка (по мішках) бачила існуючі завдання.
INSERT INTO "mgr_video_task_bags" (
  "id", "task_id", "status", "lot_id", "barcode", "weight",
  "units_count", "unit_weight", "lot_weight_kg", "video_url",
  "youtube_description", "brought_by_user_id", "brought_by_name",
  "brought_at", "created_at", "updated_at"
)
SELECT
  't_' || t."id",
  t."id",
  CASE WHEN t."status" = 'done' THEN 'done' ELSE 'pending' END,
  t."lot_id", t."barcode", t."lot_weight_kg",
  t."units_count", t."unit_weight", t."lot_weight_kg", t."video_url",
  t."youtube_description", t."brought_by_user_id", t."brought_by_name",
  t."brought_at", t."created_at", t."updated_at"
FROM "mgr_video_tasks" t
WHERE t."lot_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "mgr_video_task_bags" b WHERE b."task_id" = t."id"
  );
