import {
  Shirt,
  Footprints,
  Gem,
  Home,
  Sparkles,
  Package,
  Sofa,
  type LucideIcon,
} from "lucide-react";

export interface CategoryDisplay {
  icon: LucideIcon;
  gradient: string;
}

export const CATEGORY_DISPLAY: Record<string, CategoryDisplay> = {
  odyag: {
    icon: Shirt,
    gradient: "from-pink-400 to-rose-600",
  },
  vzuttia: {
    icon: Footprints,
    gradient: "from-amber-600 to-orange-800",
  },
  aksesuary: {
    icon: Gem,
    gradient: "from-purple-500 to-pink-600",
  },
  "dim-ta-pobut": {
    icon: Home,
    gradient: "from-teal-400 to-cyan-600",
  },
  igrashky: {
    icon: Sparkles,
    gradient: "from-yellow-400 to-orange-500",
  },
  "bric-a-brac": {
    icon: Sofa,
    gradient: "from-indigo-500 to-violet-700",
  },
  kosmetyka: {
    icon: Gem,
    gradient: "from-fuchsia-400 to-pink-500",
  },
};

export const DEFAULT_CATEGORY_DISPLAY: CategoryDisplay = {
  icon: Package,
  gradient: "from-slate-400 to-slate-600",
};

export function getCategoryDisplay(slug: string): CategoryDisplay {
  return CATEGORY_DISPLAY[slug] ?? DEFAULT_CATEGORY_DISPLAY;
}
