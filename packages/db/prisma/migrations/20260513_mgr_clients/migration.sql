-- Manager Clients (Session M1.3a)
-- Snapshot з 1С `Справочник.Контрагенты` + дочірні таблиці + 6 довідників.
-- Реальний SOAP-sync з'явиться у M1.5+; зараз — seed-скрипт з фейковими даними.

-- ─── Dictionaries ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "mgr_client_statuses" (
  "id"         TEXT    NOT NULL,
  "code"       TEXT    NOT NULL,
  "label"      TEXT    NOT NULL,
  "color_hex"  TEXT    NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "mgr_client_statuses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mgr_client_statuses_code_key"
  ON "mgr_client_statuses"("code");

CREATE TABLE IF NOT EXISTS "mgr_search_channels" (
  "id"         TEXT    NOT NULL,
  "code"       TEXT    NOT NULL,
  "label"      TEXT    NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "mgr_search_channels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mgr_search_channels_code_key"
  ON "mgr_search_channels"("code");

CREATE TABLE IF NOT EXISTS "mgr_categories_tt" (
  "id"         TEXT    NOT NULL,
  "code"       TEXT    NOT NULL,
  "label"      TEXT    NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "mgr_categories_tt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mgr_categories_tt_code_key"
  ON "mgr_categories_tt"("code");

CREATE TABLE IF NOT EXISTS "mgr_delivery_methods" (
  "id"         TEXT    NOT NULL,
  "code"       TEXT    NOT NULL,
  "label"      TEXT    NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "mgr_delivery_methods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mgr_delivery_methods_code_key"
  ON "mgr_delivery_methods"("code");

CREATE TABLE IF NOT EXISTS "mgr_assortment_codes" (
  "id"         TEXT    NOT NULL,
  "code"       TEXT    NOT NULL,
  "label"      TEXT    NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "mgr_assortment_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mgr_assortment_codes_code_key"
  ON "mgr_assortment_codes"("code");

CREATE TABLE IF NOT EXISTS "mgr_routes" (
  "id"         TEXT         NOT NULL,
  "code_1c"    TEXT,
  "name"       TEXT         NOT NULL,
  "is_active"  BOOLEAN      NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mgr_routes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "mgr_routes_code_1c_key"
  ON "mgr_routes"("code_1c");

-- ─── Clients ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "mgr_clients" (
  "id"                       TEXT          NOT NULL,
  "code_1c"                  TEXT,
  "uid_1c"                   TEXT,
  "name"                     TEXT          NOT NULL,
  "phone_primary"            TEXT,
  "city"                     TEXT,
  "region"                   TEXT,
  "street"                   TEXT,
  "house"                    TEXT,
  "nova_poshta_branch"       TEXT,
  "geolocation"              TEXT,
  "website_url"              TEXT,
  "monthly_volume"           DECIMAL(10,2),
  "license_expires_at"       TIMESTAMP(3),
  "is_own"                   BOOLEAN       NOT NULL DEFAULT false,
  "not_direct_input"         BOOLEAN       NOT NULL DEFAULT false,
  "debt"                     DECIMAL(12,2) NOT NULL DEFAULT 0,
  "overdue_debt"             DECIMAL(12,2) NOT NULL DEFAULT 0,
  "days_since_last_purchase" INTEGER,
  "last_purchase_at"         TIMESTAMP(3),
  "status_general_id"        TEXT,
  "status_operational_id"    TEXT,
  "search_channel_id"        TEXT,
  "category_tt_id"           TEXT,
  "delivery_method_id"       TEXT,
  "primary_route_id"         TEXT,
  "primary_assortment_id"    TEXT,
  "has_new_message"          BOOLEAN       NOT NULL DEFAULT false,
  "is_viber_linked"          BOOLEAN       NOT NULL DEFAULT false,
  "dialog_status"            TEXT,
  "created_at"               TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"               TIMESTAMP(3)  NOT NULL,
  "last_synced_at"           TIMESTAMP(3),
  CONSTRAINT "mgr_clients_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mgr_clients_status_general_fkey"
    FOREIGN KEY ("status_general_id") REFERENCES "mgr_client_statuses"("id") ON DELETE SET NULL,
  CONSTRAINT "mgr_clients_status_operational_fkey"
    FOREIGN KEY ("status_operational_id") REFERENCES "mgr_client_statuses"("id") ON DELETE SET NULL,
  CONSTRAINT "mgr_clients_search_channel_fkey"
    FOREIGN KEY ("search_channel_id") REFERENCES "mgr_search_channels"("id") ON DELETE SET NULL,
  CONSTRAINT "mgr_clients_category_tt_fkey"
    FOREIGN KEY ("category_tt_id") REFERENCES "mgr_categories_tt"("id") ON DELETE SET NULL,
  CONSTRAINT "mgr_clients_delivery_method_fkey"
    FOREIGN KEY ("delivery_method_id") REFERENCES "mgr_delivery_methods"("id") ON DELETE SET NULL,
  CONSTRAINT "mgr_clients_primary_route_fkey"
    FOREIGN KEY ("primary_route_id") REFERENCES "mgr_routes"("id") ON DELETE SET NULL,
  CONSTRAINT "mgr_clients_primary_assortment_fkey"
    FOREIGN KEY ("primary_assortment_id") REFERENCES "mgr_assortment_codes"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "mgr_clients_code_1c_key"
  ON "mgr_clients"("code_1c");
CREATE UNIQUE INDEX IF NOT EXISTS "mgr_clients_uid_1c_key"
  ON "mgr_clients"("uid_1c");
CREATE INDEX IF NOT EXISTS "mgr_clients_status_general_id_idx"
  ON "mgr_clients"("status_general_id");
CREATE INDEX IF NOT EXISTS "mgr_clients_search_channel_id_idx"
  ON "mgr_clients"("search_channel_id");
CREATE INDEX IF NOT EXISTS "mgr_clients_region_idx"
  ON "mgr_clients"("region");
CREATE INDEX IF NOT EXISTS "mgr_clients_phone_primary_idx"
  ON "mgr_clients"("phone_primary");
CREATE INDEX IF NOT EXISTS "mgr_clients_name_idx"
  ON "mgr_clients"("name");

-- ─── Phones ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "mgr_client_phones" (
  "id"         TEXT    NOT NULL,
  "client_id"  TEXT    NOT NULL,
  "phone"      TEXT    NOT NULL,
  "label"      TEXT,
  "messenger"  TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "mgr_client_phones_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mgr_client_phones_client_fkey"
    FOREIGN KEY ("client_id") REFERENCES "mgr_clients"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "mgr_client_phones_phone_idx"
  ON "mgr_client_phones"("phone");
CREATE INDEX IF NOT EXISTS "mgr_client_phones_client_id_idx"
  ON "mgr_client_phones"("client_id");

-- ─── Messengers / social ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "mgr_client_messengers" (
  "id"        TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "network"   TEXT NOT NULL,
  "handle"    TEXT NOT NULL,
  "url"       TEXT,
  "comment"   TEXT,
  CONSTRAINT "mgr_client_messengers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mgr_client_messengers_client_fkey"
    FOREIGN KEY ("client_id") REFERENCES "mgr_clients"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "mgr_client_messengers_client_id_idx"
  ON "mgr_client_messengers"("client_id");

-- ─── Warehouses (СкладыКонтрагентов) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "mgr_client_warehouses" (
  "id"                  TEXT         NOT NULL,
  "client_id"           TEXT         NOT NULL,
  "code_1c"             TEXT,
  "name"                TEXT         NOT NULL,
  "city"                TEXT,
  "region"              TEXT,
  "nova_poshta_branch"  TEXT,
  "license_expires_at"  TIMESTAMP(3),
  "comment"             TEXT,
  CONSTRAINT "mgr_client_warehouses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mgr_client_warehouses_client_fkey"
    FOREIGN KEY ("client_id") REFERENCES "mgr_clients"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "mgr_client_warehouses_client_id_idx"
  ON "mgr_client_warehouses"("client_id");

-- ─── Route assignments ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "mgr_client_route_assignments" (
  "id"         TEXT    NOT NULL,
  "client_id"  TEXT    NOT NULL,
  "route_id"   TEXT    NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "mgr_client_route_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mgr_client_route_assignments_client_fkey"
    FOREIGN KEY ("client_id") REFERENCES "mgr_clients"("id") ON DELETE CASCADE,
  CONSTRAINT "mgr_client_route_assignments_route_fkey"
    FOREIGN KEY ("route_id") REFERENCES "mgr_routes"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "mgr_client_route_assignments_client_route_key"
  ON "mgr_client_route_assignments"("client_id", "route_id");
CREATE INDEX IF NOT EXISTS "mgr_client_route_assignments_route_id_idx"
  ON "mgr_client_route_assignments"("route_id");

-- ─── Assortment items (артикул + name + last ordered) ───────────────────────

CREATE TABLE IF NOT EXISTS "mgr_client_assortment" (
  "id"              TEXT         NOT NULL,
  "client_id"       TEXT         NOT NULL,
  "product_code"    TEXT         NOT NULL,
  "product_name"    TEXT,
  "last_ordered_at" TIMESTAMP(3),
  CONSTRAINT "mgr_client_assortment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mgr_client_assortment_client_fkey"
    FOREIGN KEY ("client_id") REFERENCES "mgr_clients"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "mgr_client_assortment_client_id_idx"
  ON "mgr_client_assortment"("client_id");

-- ─── Timeline (Оплата / Реалізація / Нагадування / Коментар) ────────────────

CREATE TABLE IF NOT EXISTS "mgr_client_timeline" (
  "id"             TEXT         NOT NULL,
  "client_id"      TEXT         NOT NULL,
  "kind"           TEXT         NOT NULL,
  "body"           TEXT         NOT NULL,
  "occurred_at"    TIMESTAMP(3) NOT NULL,
  "author_user_id" TEXT,
  "metadata"       JSONB,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mgr_client_timeline_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "mgr_client_timeline_client_fkey"
    FOREIGN KEY ("client_id") REFERENCES "mgr_clients"("id") ON DELETE CASCADE,
  CONSTRAINT "mgr_client_timeline_author_fkey"
    FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "mgr_client_timeline_client_occurred_idx"
  ON "mgr_client_timeline"("client_id", "occurred_at" DESC);

-- ─── ClientAssignment FK upgrade (M1.1 customer_id був без FK) ──────────────
-- Спершу прибираємо існуючий constraint якщо він є (від попередніх спроб),
-- потім додаємо FK на mgr_clients(id).

DO $$ BEGIN
  ALTER TABLE "client_assignments"
    DROP CONSTRAINT IF EXISTS "client_assignments_customer_id_fkey";
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "client_assignments"
    ADD CONSTRAINT "client_assignments_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "mgr_clients"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "client_assignments_customer_id_idx"
  ON "client_assignments"("customer_id");
