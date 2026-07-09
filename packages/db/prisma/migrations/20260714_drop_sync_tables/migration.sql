-- ТЗ 8.0 Блок A: прибрати мертві таблиці живої 1С-синхронізації.
-- Жоден runtime-код у них не пише/не читає (жива синхронізація знесена в 7.0).
-- Офлайн-імпорт історії з 1С не використовує ці таблиці.
DROP TABLE IF EXISTS "mgr_sync_jobs";
DROP TABLE IF EXISTS "mgr_sync_state";
DROP TYPE IF EXISTS "mgr_sync_job_status";
DROP TYPE IF EXISTS "mgr_sync_entity_type";
