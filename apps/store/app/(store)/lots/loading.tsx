import { Skeleton } from "@ltex/ui";

export default function LotsLoading() {
  return (
    <div className="container mx-auto px-4 py-6">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-4 h-9 w-48" />
      <Skeleton className="mt-1 h-4 w-28" />
      <div className="mt-4 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>
      <Skeleton className="mt-6 h-[400px] rounded-lg" />
    </div>
  );
}
