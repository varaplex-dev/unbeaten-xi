import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[color,background-color,box-shadow,transform] duration-200 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-[#04120d] shadow-[0_0_18px_rgba(34,230,168,0.55)] hover:bg-accent-strong hover:shadow-[0_0_30px_rgba(34,230,168,0.9)] active:scale-[0.98]",
        secondary:
          "bg-background-elevated text-foreground border border-border hover:border-accent/50 hover:shadow-[0_0_18px_rgba(34,230,168,0.35)] active:scale-[0.98]",
        ghost: "text-foreground-muted hover:text-foreground hover:bg-white/5",
        gold: "bg-gold text-[#231400] shadow-[0_0_18px_rgba(232,179,76,0.5)] hover:brightness-110 hover:shadow-[0_0_30px_rgba(232,179,76,0.85)] active:scale-[0.98]",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-6 text-base",
        lg: "h-14 px-8 text-lg",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
