-- Блок «Завдання» (2026-07-18) — доручення між користувачами. Additive.
CREATE TABLE IF NOT EXISTS "mgr_tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "created_by_user_id" TEXT NOT NULL,
    "assignee_user_id" TEXT,
    "assignee_role" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "type" TEXT NOT NULL DEFAULT 'manual',
    "result_comment" TEXT,
    "completed_at" TIMESTAMP(3),
    "completed_by_user_id" TEXT,
    "client_id" TEXT,
    "sale_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "mgr_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "mgr_tasks_assignee_user_id_status_idx" ON "mgr_tasks" ("assignee_user_id", "status");
CREATE INDEX IF NOT EXISTS "mgr_tasks_created_by_user_id_status_idx" ON "mgr_tasks" ("created_by_user_id", "status");
CREATE INDEX IF NOT EXISTS "mgr_tasks_assignee_role_status_idx" ON "mgr_tasks" ("assignee_role", "status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mgr_tasks_created_by_user_id_fkey') THEN
    ALTER TABLE "mgr_tasks" ADD CONSTRAINT "mgr_tasks_created_by_user_id_fkey"
      FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mgr_tasks_assignee_user_id_fkey') THEN
    ALTER TABLE "mgr_tasks" ADD CONSTRAINT "mgr_tasks_assignee_user_id_fkey"
      FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
