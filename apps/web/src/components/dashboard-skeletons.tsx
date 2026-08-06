import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function OverviewSkeleton() {
  return (
    <div className="space-y-6 md:space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <Skeleton className="h-16 w-full rounded-xl md:hidden" />
      <div className="hidden md:grid md:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-24 mb-3" />
              <Skeleton className="h-9 w-16" />
            </CardHeader>
          </Card>
        ))}
      </div>
      <div>
        <Skeleton className="h-7 w-28 mb-4" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <Skeleton className="h-2 w-full mt-4 rounded-full" />
                <Skeleton className="h-4 w-36 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ChildrenListSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-28 mt-2" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ChildDetailSkeleton() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="h-4 w-32 mb-4" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-5 w-64 max-w-full" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-56 max-w-full mt-2" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-9 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function ExtensionRequestCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-64 max-w-full mt-2" />
          </CardHeader>
          <CardContent className="flex gap-3">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ActivityFeedSkeleton({ count = 5 }: { count?: number }) {
  return (
    <Card className="overflow-hidden p-0">
      <ul className="divide-y divide-border">
        {Array.from({ length: count }, (_, i) => (
          <li
            key={i}
            className="flex flex-col gap-1 px-4 py-3 sm:px-5 sm:py-3.5 md:flex-row md:items-start md:justify-between md:gap-3"
          >
            <div className="min-w-0 space-y-2 flex-1">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-56 max-w-full" />
              <Skeleton className="h-3 w-24 md:hidden" />
            </div>
            <Skeleton className="hidden h-3 w-28 shrink-0 md:block" />
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function ActivityPageSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>
      <section className="space-y-4">
        <Skeleton className="h-6 w-24" />
        <ExtensionRequestCardsSkeleton />
      </section>
      <section className="space-y-4">
        <Skeleton className="h-6 w-28" />
        <ActivityFeedSkeleton />
      </section>
    </div>
  );
}

export function ExtensionsPageSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-80 max-w-full" />
      </div>
      <section className="space-y-4">
        <Skeleton className="h-6 w-24" />
        <ExtensionRequestCardsSkeleton />
      </section>
    </div>
  );
}

export function SnapshotsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="overflow-hidden p-0">
          <Skeleton className="aspect-video w-full rounded-none rounded-t-xl" />
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-40" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function SnapshotsPageSkeleton() {
  return (
    <div className="space-y-6 md:space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <SnapshotsGridSkeleton />
    </div>
  );
}

export function SettingsPageSkeleton() {
  return (
    <div className="space-y-8 max-w-xl">
      <div className="space-y-2">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-5 w-64 max-w-full" />
      </div>
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-56 max-w-full mt-2" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-9 w-28" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
