import { Skeleton } from "@ltex/ui";

export default function ProductLoading() {
  return (
    <div className="container mx-auto px-4 py-6">
      <Skeleton className="h-4 w-60" />
      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <Skeleton className="aspect-[4/3] w-full rounded-lg" />
        <div className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-40" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    </div>
  );
}
