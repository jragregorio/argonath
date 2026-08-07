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
  default: "bg-primary/20 text-primary",
  success: "bg-green-500/20 text-green-400",
  warning: "bg-yellow-500/20 text-yellow-400",
  destructive: "bg-destructive/20 text-destructive",
  secondary: "bg-muted text-muted-foreground",
  // After-hours bonus — soft violet wash + light lilac text (readable on dark cards)
  plume:
    "bg-[color-mix(in_srgb,#e8e0f0_16%,var(--color-plume))] text-[color-mix(in_srgb,#e8e0f0_82%,var(--color-plume))]",
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
