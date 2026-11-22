import { Skeleton, SkeletonGroup } from "@/components/ui";

export default function Loading() {
  return (
    <SkeletonGroup className="flex flex-col gap-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
    </SkeletonGroup>
  );
}
