import type { ComponentType } from "react";
import { Card } from "@ltex/ui";
import { OpenTabLink } from "./open-tab-link";

export function DashboardTile({
  href,
  icon: Icon,
  title,
  count,
  countLabel,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  count: number;
  countLabel: string;
}) {
  return (
    <OpenTabLink href={href} label={title} className="block">
      <Card className="h-full p-6 transition-shadow hover:shadow-md">
        <Icon className="mb-3 h-8 w-8 text-green-700" />
        <h3 className="font-semibold text-gray-800">{title}</h3>
        <p className="mt-1 text-sm text-gray-500">
          {count === 0 ? `Немає ${countLabel}` : `${count} ${countLabel}`}
        </p>
      </Card>
    </OpenTabLink>
  );
}
