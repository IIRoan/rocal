"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";

import { cn } from "@workspace/ui/lib/utils";

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        // Base
        "fixed inset-0 z-50 bg-black/50",
        // Animate opacity
        "transition-[opacity,backdrop-filter] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "data-[state=open]:opacity-100 data-[state=closed]:opacity-0",
        // Subtle blur when supported
        "supports-[backdrop-filter]:backdrop-blur-sm data-[state=open]:backdrop-blur-md",
        // Respect reduced motion
        "motion-reduce:transition-none",
        className
      )}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100vh",
      }}
      {...props}
    />
  );
}

type DialogVariant = "center" | "top" | "bottom";

type DialogContentProps = React.ComponentProps<
  typeof DialogPrimitive.Content
> & {
  variant?: DialogVariant;
};

function DialogContent({
  className,
  children,
  variant = "center",
  ...props
}: DialogContentProps) {
  // Variant presets
  const positionClasses =
    variant === "center"
      ? "left-1/2 top-1/2" // Transform handled by CSS
      : variant === "top"
        ? "left-1/2 top-6 -translate-x-1/2"
        : // bottom
          "left-1/2 bottom-6 -translate-x-1/2";

  // Animation per variant - center uses CSS animation, others use Tailwind
  const animationClasses =
    variant === "center"
      ? "" // Animation handled by CSS in globals.css for data-slot="dialog-content"
      : variant === "top"
        ? [
            // Slide from top + fade
            "data-[state=open]:opacity-100 data-[state=closed]:opacity-0",
            "data-[state=open]:translate-y-0 data-[state=closed]:-translate-y-4",
          ].join(" ")
        : [
            // bottom: lift up + fade
            "data-[state=open]:opacity-100 data-[state=closed]:opacity-0",
            "data-[state=open]:translate-y-0 data-[state=closed]:translate-y-4",
          ].join(" ");

  // Suggested sizing defaults per variant
  const sizeDefaults =
    variant === "center"
      ? "w-[520px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)]"
      : variant === "top"
        ? "w-[720px] max-w-[min(90vw,840px)]"
        : "w-[720px] max-w-[min(90vw,840px)]";

  // Radius per variant (command palette often slightly less rounded)
  const radius =
    variant === "center" ? "rounded-xl" : "rounded-lg md:rounded-xl";

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          // Base
          "bg-background fixed z-50 grid gap-4 overflow-y-auto border p-6 shadow-lg",
          radius,
          sizeDefaults,
          positionClasses,
          // No transition classes for center variant - handled by CSS
          variant === "center" ? "" : "transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
          animationClasses,
          // Reduce motion support
          "motion-reduce:transition-none",
          className
        )}
        // Inline style for positioning without transform conflicts
        style={{
          maxHeight: "calc(100vh - 2rem)",
          ...props.style,
        }}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="group focus-visible:border-ring focus-visible:ring-ring/50 hover:bg-accent/50 hover:scale-105 focus-visible:scale-105 absolute top-3 right-3 flex size-7 items-center justify-center rounded transition-all duration-200 ease-out outline-none focus-visible:ring-[3px] disabled:pointer-events-none">
          <XIcon
            size={16}
            className="opacity-60 transition-opacity group-hover:opacity-100"
          />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex flex-col gap-1 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-3 sm:flex-row sm:justify-end fixed",
        className
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
