import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@workspace/ui/lib/utils";
const buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 ease-out disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 hover:scale-[1.02] active:scale-[0.98] transform-gpu", {
    variants: {
        variant: {
            default: "bg-primary text-primary-foreground shadow-md hover:bg-primary/90 hover:shadow-lg active:bg-primary/95 active:shadow-sm",
            destructive: "bg-destructive text-destructive-foreground shadow-md hover:bg-destructive/90 hover:shadow-lg active:bg-destructive/95 active:shadow-sm focus-visible:ring-destructive/50",
            outline: "border border-border bg-background shadow-sm hover:bg-accent hover:text-accent-foreground hover:border-accent-foreground/20 hover:shadow-md active:bg-accent/90 active:shadow-sm",
            secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 hover:shadow-md active:bg-secondary/90 active:shadow-sm",
            ghost: "hover:bg-accent hover:text-accent-foreground hover:shadow-sm active:bg-accent/90 hover:scale-105 active:scale-95",
            link: "text-primary underline-offset-4 hover:underline focus-visible:ring-0 focus-visible:ring-offset-0 hover:scale-105 active:scale-95",
        },
        size: {
            default: "h-9 px-4 py-2 has-[>svg]:px-3",
            sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
            lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
            icon: "size-9",
        },
    },
    defaultVariants: {
        variant: "default",
        size: "default",
    },
});
function Button({ className, variant, size, asChild = false, ...props }) {
    const Comp = asChild ? Slot : "button";
    return (<Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props}/>);
}
export { Button, buttonVariants };
