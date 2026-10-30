import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {}

function Badge({ className, ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-slate-700 px-2.5 py-0.5 text-xs font-semibold text-slate-200",
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
