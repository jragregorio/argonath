import { cn } from "@argonath/ui";

type BadgeProps = {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "destructive" | "secondary";
  className?: string;
};

const variants = {
  default: "bg-primary/20 text-primary",
  success: "bg-green-500/20 text-green-400",
  warning: "bg-yellow-500/20 text-yellow-400",
  destructive: "bg-destructive/20 text-destructive",
  secondary: "bg-secondary text-secondary-foreground",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
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
