import { ChildrenListSkeleton } from "@/components/dashboard-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function ChildrenLoading() {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-5 w-64 max-w-full" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <ChildrenListSkeleton />
    </div>
  );
}
