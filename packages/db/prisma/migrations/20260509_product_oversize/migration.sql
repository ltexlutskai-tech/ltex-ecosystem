ALTER TABLE "products"
  ADD COLUMN "is_oversize" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "products_is_oversize_idx" ON "products"("is_oversize");
