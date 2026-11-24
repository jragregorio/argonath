import type { ReactNode } from "react";
import { cn } from "@warden/ui";

type PageHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  hideDescriptionOnMobile?: boolean;
  /**
   * Keep `action` on the title row at every width (no wrap). Use for compact
   * actions like a "⋯" button; wide buttons should keep the default wrap.
   */
  keepActionInline?: boolean;
};

export function PageHeader({
  title,
  description,
  action,
  hideDescriptionOnMobile = false,
  keepActionInline = false,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4",
        keepActionInline ? "flex-nowrap" : "flex-wrap"
      )}
    >
      <div className={cn("min-w-0", keepActionInline && "flex-1")}>
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
