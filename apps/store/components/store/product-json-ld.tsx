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

export function ProductJsonLd({ product, price, currency }: Props) {
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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
