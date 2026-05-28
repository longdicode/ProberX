"use client";

import { Skeleton } from "@/components/ui/skeleton";

export { PageSkeleton as LoadingSkeleton };

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2"><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-72" /></div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" /><Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
