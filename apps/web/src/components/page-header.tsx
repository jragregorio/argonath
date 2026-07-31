import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          {title}
        </h1>
        <div className="mt-3 h-px w-12 bg-attention/50" aria-hidden="true" />
        {description && (
          <p className="mt-3 text-muted-foreground text-pretty">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
