-- Full-Text Search (FTS) Migration for L-TEX Products
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
--
-- This migration adds two types of search indexes:
-- 1. GIN index on tsvector — for exact word matching via PostgreSQL full-text search
-- 2. GIN index with pg_trgm — for fuzzy/similarity matching (typo tolerance)
--
-- Source: packages/db/prisma/migrations/20260406_fts_gin_trigram/migration.sql
--
-- How it works:
-- - The app first searches using tsvector (fast, exact word stems)
-- - If tsvector returns 0 results, it falls back to trigram similarity (fuzzy)
-- - Autocomplete uses both: prefix matching via tsvector + similarity ranking

-- ═══════════════════════════════════════════════════════════════════════
-- 1. GIN index for full-text search (tsvector)
-- ═══════════════════════════════════════════════════════════════════════
-- Creates a GIN index on the concatenation of product name, description,
-- and article code. Uses 'simple' config (not language-specific) because
-- Ukrainian stemming is not built into PostgreSQL by default.
-- This index powers: fullTextSearch() in lib/catalog.ts
CREATE INDEX IF NOT EXISTS idx_products_fts
  ON products
  USING GIN (to_tsvector('simple', name || ' ' || COALESCE(description, '') || ' ' || COALESCE(article_code, '')));

-- ═══════════════════════════════════════════════════════════════════════
-- 2. pg_trgm extension for fuzzy matching
-- ═══════════════════════════════════════════════════════════════════════
-- pg_trgm breaks text into 3-character sequences (trigrams) and compares
-- them for similarity. This enables typo-tolerant search.
-- Example: "джинси" → {"дж", "жи", "ин", "нс", "сі"}
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. GIN index for trigram similarity search
-- ═══════════════════════════════════════════════════════════════════════
-- Creates a GIN index using trigram operators on the product name.
-- This index powers the fallback search when tsvector returns no results,
-- and also the autocompleteSearch() similarity ranking.
CREATE INDEX IF NOT EXISTS idx_products_trgm
  ON products
  USING GIN (name gin_trgm_ops);
