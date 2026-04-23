import { cn } from '@/lib/utils/cn';

interface SkeletonProps {
  className?: string;
}

/** Lightweight placeholder block for pages where keeping layout stable feels better than a centered loader. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-xl bg-muted/55', className)}
    />
  );
}
