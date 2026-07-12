-- Постачальник рядка комплектації перепаковки (вибір з довідника або вручну).
-- Additive, idempotent.
ALTER TABLE "mgr_repacking_items" ADD COLUMN IF NOT EXISTS "supplier_name" TEXT;
