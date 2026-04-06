-- Full-text search GIN index on products
CREATE INDEX IF NOT EXISTS idx_products_fts
  ON products
  USING GIN (to_tsvector('simple', name || ' ' || COALESCE(description, '') || ' ' || COALESCE(article_code, '')));

-- Enable pg_trgm extension for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram index for similarity search
CREATE INDEX IF NOT EXISTS idx_products_trgm
  ON products
  USING GIN (name gin_trgm_ops);
