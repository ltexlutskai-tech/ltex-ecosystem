-- Роль «Відеозона»
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'videozone';

-- Завдання відеозони
CREATE TABLE IF NOT EXISTS "mgr_video_tasks" (
  "id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'new',
  "manager_user_id" TEXT,
  "manager_name" TEXT,
  "client_id" TEXT,
  "client_name" TEXT,
  "customer_id" TEXT,
  "product_id" TEXT NOT NULL,
  "product_name" TEXT NOT NULL,
  "article_code" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "lot_id" TEXT,
  "barcode" TEXT,
  "requested_barcode" TEXT,
  "assigned_user_id" TEXT,
  "assigned_name" TEXT,
  "video_url" TEXT,
  "youtube_description" TEXT,
  "season" TEXT,
  "quality" TEXT,
  "gender" TEXT,
  "sizes" TEXT,
  "units_count" TEXT,
  "unit_weight" TEXT,
  "lot_weight_kg" DOUBLE PRECISION,
  "brought_at" TIMESTAMP(3),
  "brought_by_user_id" TEXT,
  "brought_by_name" TEXT,
  "completed_at" TIMESTAMP(3),
  "completed_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mgr_video_tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "mgr_video_tasks_status_idx" ON "mgr_video_tasks"("status");
CREATE INDEX IF NOT EXISTS "mgr_video_tasks_assigned_user_id_status_idx" ON "mgr_video_tasks"("assigned_user_id", "status");
CREATE INDEX IF NOT EXISTS "mgr_video_tasks_manager_user_id_status_idx" ON "mgr_video_tasks"("manager_user_id", "status");

-- Довідник посилань для YouTube-опису
CREATE TABLE IF NOT EXISTS "mgr_video_links" (
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "url" TEXT NOT NULL DEFAULT '',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mgr_video_links_pkey" PRIMARY KEY ("key")
);
