import { Skeleton } from "@ltex/ui";

export default function CatalogLoading() {
  return (
    <div className="container mx-auto px-4 py-6">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-4 h-9 w-64" />
      <Skeleton className="mt-1 h-4 w-24" />
      <div className="mt-4 flex gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-36 rounded-md" />
        ))}
      </div>
      <div className="mt-6 grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-[4/3] w-full rounded-lg" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
