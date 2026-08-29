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
          "inline-flex items-center justify-center gap-2 font-medium tracking-tight transition duration-150 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-45",
          size === "sm" && "h-9 rounded-xl px-3.5 text-sm",
          size === "md" && "h-11 rounded-2xl px-5 text-sm",
          size === "lg" && "h-[3.15rem] w-full rounded-2xl px-6 text-[15px]",
          variant === "primary" && "bg-foreground text-white hover:bg-black",
          variant === "secondary" &&
            "border border-border bg-white text-foreground hover:border-foreground/25 hover:bg-surface",
          variant === "ghost" && "bg-transparent text-foreground hover:bg-surface-2",
          variant === "danger" && "bg-danger text-white hover:opacity-90",
          variant === "gold" && "bg-gold text-white hover:brightness-95",
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
