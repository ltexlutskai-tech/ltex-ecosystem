-- Session 7.2 Block 4: lightweight, cookie-less site visit counter.
CREATE TABLE IF NOT EXISTS "site_visit_days" (
  "day" DATE NOT NULL,
  "pageviews" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "site_visit_days_pkey" PRIMARY KEY ("day")
);

-- One row per (day, hashed visitor) → count = unique visitors/day. No PII:
-- visitor_hash = sha256(ip + user-agent + day + salt).
CREATE TABLE IF NOT EXISTS "site_visitors" (
  "day" DATE NOT NULL,
  "visitor_hash" TEXT NOT NULL,
  CONSTRAINT "site_visitors_pkey" PRIMARY KEY ("day", "visitor_hash")
);
