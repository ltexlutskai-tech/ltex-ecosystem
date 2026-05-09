-- Numeric range columns for products.unitsPerKg / unitWeight
-- Existing string columns remain as-is for human-readable display.
-- These additive Float pairs power range-overlap filters in /catalog and /lots.

ALTER TABLE "products"
  ADD COLUMN "units_per_kg_min" DOUBLE PRECISION,
  ADD COLUMN "units_per_kg_max" DOUBLE PRECISION,
  ADD COLUMN "unit_weight_min" DOUBLE PRECISION,
  ADD COLUMN "unit_weight_max" DOUBLE PRECISION;

CREATE INDEX "products_units_per_kg_min_idx" ON "products"("units_per_kg_min");
CREATE INDEX "products_units_per_kg_max_idx" ON "products"("units_per_kg_max");
CREATE INDEX "products_unit_weight_min_idx" ON "products"("unit_weight_min");
CREATE INDEX "products_unit_weight_max_idx" ON "products"("unit_weight_max");
