import type { ReactNode } from "react";
import { cn } from "@warden/ui";

type PageHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  hideDescriptionOnMobile?: boolean;
};

export function PageHeader({
  title,
  description,
  action,
  hideDescriptionOnMobile = false,
}: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {title}
        </h1>
        <div className="mt-3 h-px w-12 bg-attention/50" aria-hidden="true" />
        {description && (
          <p
            className={cn(
              "mt-3 text-muted-foreground text-pretty",
              hideDescriptionOnMobile && "max-md:hidden"
            )}
          >
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
