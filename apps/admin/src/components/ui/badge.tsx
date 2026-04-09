import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary/15 text-primary border border-primary/20',
        secondary: 'bg-secondary text-secondary-foreground',
        destructive: 'bg-destructive/15 text-red-400 border border-destructive/20',
        warning: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
        blue: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
        purple: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
        orange: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
        muted: 'bg-muted text-muted-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
