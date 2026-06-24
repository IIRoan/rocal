"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
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
      forceMount
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50 duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "supports-[backdrop-filter]:backdrop-blur-sm supports-[backdrop-filter]:data-[state=open]:backdrop-blur-md",
        className,
      )}
      {...props}
    />
  );
}

type DialogVariant = "center" | "top" | "bottom" | "spotlight";

type DialogContentProps = React.ComponentProps<
  typeof DialogPrimitive.Content
> & {
  variant?: DialogVariant;
  showClose?: boolean;
};

function DialogContent({
  className,
  children,
  variant = "center",
  showClose = true,
  ...props
}: DialogContentProps) {
  // NOTE: spotlight intentionally sits in the upper viewport (top-[15%]) and
  // only translates on X — vertical position is fixed, NOT centered. Don't
  // change to `top-1/2 -translate-y-1/2` without a UX review; the command
  // palette and similar surfaces rely on this near-top placement.
  // The dialog can grow to use most of the viewport height when content is long.
  const positionClasses =
    variant === "center"
      ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      : variant === "spotlight"
        ? "left-1/2 top-[10%] -translate-x-1/2"
        : variant === "top"
          ? "left-1/2 top-[calc(env(safe-area-inset-top)+1rem)] -translate-x-1/2"
          : "left-1/2 bottom-[calc(env(safe-area-inset-bottom)+1rem)] -translate-x-1/2";

  const sizeDefaults =
    variant === "center"
      ? "w-[520px] max-w-[calc(100dvw-1rem)] sm:max-w-[calc(100dvw-2rem)] max-h-[calc(100dvh-1rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] sm:max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))]"
      : variant === "spotlight"
        ? "w-[560px] max-w-[calc(100dvw-2rem)] max-h-[calc(100dvh-1rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))]"
        : variant === "top"
          ? "w-[720px] max-w-[min(calc(100dvw-1rem),840px)]"
          : "w-[720px] max-w-[min(calc(100dvw-1rem),840px)]";

  const animationClasses =
    variant === "top"
      ? "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2"
      : variant === "bottom"
        ? "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom-2 data-[state=open]:slide-in-from-bottom-2"
        : variant === "spotlight"
          ? "dialog-spotlight-animation"
          : "dialog-center-animation";

  const radius =
    variant === "spotlight"
      ? "rounded-lg"
      : variant === "center"
        ? "rounded-xl"
        : "rounded-lg md:rounded-xl";

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        forceMount
        data-slot="dialog-content"
        data-variant={variant}
        className={cn(
          // Base
          "bg-background fixed z-50 overflow-hidden border shadow-lg duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
          radius,
          sizeDefaults,
          positionClasses,
          animationClasses,
          className,
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close className="group focus-visible:border-ring focus-visible:ring-ring/50 hover:bg-accent/50 hover:scale-105 focus-visible:scale-105 absolute top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] flex size-7 items-center justify-center rounded transition-all duration-200 ease-out outline-none focus-visible:ring-[3px] disabled:pointer-events-none">
            <XIcon
              size={16}
              className="opacity-60 transition-opacity group-hover:opacity-100"
            />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1 text-center sm:text-left", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-3 sm:flex-row sm:justify-end [&>button]:w-full sm:[&>button]:w-auto",
        className,
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
      data-slot="dialog-title"
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
      data-slot="dialog-description"
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
