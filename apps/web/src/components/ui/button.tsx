import { cn } from "@warden/ui";
import { type ButtonHTMLAttributes, forwardRef } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?:
    | "default"
    | "secondary"
    | "destructive"
    | "attention"
    | "outline"
    | "ghost";
  size?: "sm" | "md" | "lg";
};

const variants = {
  default: "bg-primary text-primary-foreground hover:bg-accent",
  secondary: "bg-secondary text-secondary-foreground hover:bg-muted",
  destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
  attention: "bg-attention text-attention-foreground hover:opacity-90",
  outline: "border border-border bg-transparent hover:bg-secondary",
  ghost: "hover:bg-secondary",
};

const sizes = {
  sm: "min-h-9 px-3 py-1.5 text-sm",
  md: "min-h-11 px-4 py-2.5 text-sm sm:text-base",
  lg: "min-h-12 px-6 py-3 text-base sm:text-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
