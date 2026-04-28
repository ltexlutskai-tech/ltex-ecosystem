"use client";

import { useEffect } from "react";
import { useRecentlyViewed } from "@/lib/recently-viewed";

interface TrackProductViewProps {
  id: string;
  slug: string;
  name: string;
  quality: string;
  imageUrl: string | null;
  priceEur: number | null;
  priceUnit: string;
}

export function TrackProductView(props: TrackProductViewProps) {
  const { addItem } = useRecentlyViewed();

  useEffect(() => {
    addItem(props);
  }, [props.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
