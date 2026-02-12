import { cn } from '../../lib/cn.ts';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-lg bg-white/5', className)} {...props} />;
}

export { Skeleton };
