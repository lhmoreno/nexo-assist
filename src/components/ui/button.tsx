import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const variants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[8px] text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0285F7]",
  {
    variants: {
      variant: {
        default: "bg-[#0062C4] text-white hover:bg-[#0071D6]",
        secondary: "bg-[#F6F7F9] text-[#3D4656] hover:bg-[#EDEDED]",
        outline:
          "border border-[#E6E8EC] bg-white text-[#1B2431] hover:bg-[#F6F7F9]",
        ghost: "text-[#3D4656] hover:bg-[#F6F7F9]",
        destructive: "bg-[#EE343B12] text-[#C4161D] hover:bg-[#EE343B20]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3",
        lg: "h-11 px-6",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof variants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(variants({ variant, size, className }))} {...props} />
  );
}
