-- Session 7.2: hide category (and its subtree) from site + trade agents.
-- Products stay in the system; only visibility is toggled. Additive.
ALTER TABLE "categories"
  ADD COLUMN IF NOT EXISTS "hidden_from_catalog" BOOLEAN NOT NULL DEFAULT false;
