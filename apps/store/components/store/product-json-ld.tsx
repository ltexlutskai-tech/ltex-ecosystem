import { headers } from "next/headers";

interface Props {
  product: {
    name: string;
    slug: string;
    description: string;
    images: { url: string }[];
  };
  price?: number;
  currency?: string;
}

export async function ProductJsonLd({ product, price, currency }: Props) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description || product.name,
    image: product.images.map((i) => i.url),
    ...(price && {
      offers: {
        "@type": "Offer",
        price: price.toFixed(2),
        priceCurrency: currency ?? "EUR",
        availability: "https://schema.org/InStock",
      },
    }),
  };

  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
