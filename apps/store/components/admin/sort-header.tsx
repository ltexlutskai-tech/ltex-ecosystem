import Link from "next/link";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

interface SortHeaderProps {
  label: string;
  field: string;
  currentSort: string;
  currentDir: string;
  href: string;
}

export function SortHeader({
  label,
  field,
  currentSort,
  currentDir,
  href,
}: SortHeaderProps) {
  const isActive = currentSort === field;

  return (
    <th className="px-4 py-3 font-medium">
      <Link
        href={href}
        className="inline-flex items-center gap-1 hover:text-green-600"
      >
        {label}
        {isActive ? (
          currentDir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-30" />
        )}
      </Link>
    </th>
  );
}
