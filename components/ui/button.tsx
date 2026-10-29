import * as React from "react";

import { cn } from "@/lib/utils";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "gold";
  size?: "sm" | "md" | "lg";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-medium tracking-tight transition duration-150 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-deep",
          size === "sm" && "h-10 min-h-10 rounded-xl px-3.5 text-sm",
          size === "md" && "h-11 rounded-2xl px-5 text-sm",
          size === "lg" &&
            "min-h-[3.15rem] w-full rounded-2xl px-6 text-[15px] whitespace-nowrap",
          variant === "primary" && "bg-foreground text-white shadow-sm hover:bg-black",
          variant === "secondary" &&
            "border border-border bg-white text-foreground hover:border-foreground/25 hover:bg-surface",
          variant === "ghost" && "bg-transparent text-muted hover:bg-surface-2 hover:text-foreground",
          variant === "danger" && "bg-danger text-white hover:opacity-90",
          variant === "gold" && "bg-gold-deep text-white shadow-sm hover:bg-foreground",
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
