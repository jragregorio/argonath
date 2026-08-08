import { cn } from "@warden/ui";

type BadgeProps = {
  children: React.ReactNode;
  variant?:
    | "default"
    | "success"
    | "warning"
    | "destructive"
    | "secondary"
    | "plume";
  className?: string;
  title?: string;
};

const variants = {
  default: "bg-primary/15 text-primary",
  // Semantic tokens (not green-400) so light themes keep readable contrast
  success: "bg-primary/15 text-primary",
  warning: "bg-attention/15 text-attention",
  destructive: "bg-destructive/15 text-destructive",
  secondary: "bg-muted text-muted-foreground",
  // After-hours bonus — plume wash + foreground (readable on dark and light)
  plume: "bg-plume text-foreground",
};

export function Badge({ children, variant = "default", className, title }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
