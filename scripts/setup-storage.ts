/**
 * Create Supabase Storage bucket for product images.
 *
 * Usage:
 *   npx tsx scripts/setup-storage.ts
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
  console.error("Set them in .env or as environment variables.");
  process.exit(1);
}

async function main() {
  const BUCKET = "product-images";

  console.log(`Creating bucket "${BUCKET}"...`);

  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: true,
      file_size_limit: 5 * 1024 * 1024, // 5MB
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
    }),
  });

  const data = await res.json();

  if (res.ok) {
    console.log(`Bucket "${BUCKET}" created successfully.`);
  } else if (data.message?.includes("already exists")) {
    console.log(`Bucket "${BUCKET}" already exists — OK.`);
  } else {
    console.error("Failed to create bucket:", data);
    process.exit(1);
  }
}

main();
