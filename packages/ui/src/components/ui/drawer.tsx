"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { XIcon } from "lucide-react";

import { cn } from "@workspace/ui/lib/utils";
import { useDrawerViewport } from "../../hooks/use-drawer-viewport";

function Drawer({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      forceMount
      data-slot="drawer-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className,
      )}
      {...props}
    />
  );
}

type DrawerContentProps = React.ComponentProps<
  typeof DrawerPrimitive.Content
> & {
  responsive?: boolean;
  responsiveHeight?: string;
  keyboardAware?: boolean;
};

function DrawerContent({
  className,
  children,
  responsive = false,
  responsiveHeight = "92dvh",
  keyboardAware = true,
  style,
  ...props
}: DrawerContentProps) {
  const { viewportStyle } = useDrawerViewport({
    enabled: responsive,
    keyboardAware,
    responsiveHeight,
  });

  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />
      <DrawerPrimitive.Content
        forceMount
        data-slot="drawer-content"
        className={cn(
          "group/drawer-content bg-background fixed z-50 flex h-auto min-h-0 flex-col",
          "data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-[20px] data-[vaul-drawer-direction=top]:border-b",
          "data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[92dvh] data-[vaul-drawer-direction=bottom]:rounded-t-[20px] data-[vaul-drawer-direction=bottom]:border-t",
          "data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-sm",
          "data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-sm",
          className,
        )}
        style={
          responsive
            ? {
                ...viewportStyle,
                ...(style as React.CSSProperties | undefined),
              }
            : style
        }
        {...props}
      >
        <div className="bg-muted-foreground/60 mx-auto mt-3 hidden h-1.5 w-12 shrink-0 rounded-full group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

function DrawerHeader({
  className,
  showClose = true,
  children,
  ...props
}: React.ComponentProps<"div"> & { showClose?: boolean }) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "flex flex-row items-center gap-2 border-b border-border p-4 text-left",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</div>
      {showClose ? (
        <DrawerClose className="flex size-10 shrink-0 items-center justify-center rounded-md text-foreground opacity-70 transition-opacity hover:opacity-100">
          <XIcon size={20} />
          <span className="sr-only">Close</span>
        </DrawerClose>
      ) : null}
    </div>
  );
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col gap-2 border-t border-border p-4", className)}
      {...props}
    />
  );
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("text-foreground text-xl leading-none font-semibold", className)}
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

interface DrawerShellProps extends React.ComponentProps<"div"> {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  headerClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
}

function DrawerShell({
  header,
  footer,
  children,
  className,
  headerClassName,
  bodyClassName,
  footerClassName,
  ...props
}: DrawerShellProps) {
  return (
    <div
      data-slot="drawer-shell"
      className={cn(
        "grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto]",
        className,
      )}
      {...props}
    >
      <div
        data-slot="drawer-shell-header"
        className={cn("min-h-0", headerClassName)}
      >
        {header}
      </div>
      <div
        data-slot="drawer-shell-body"
        className={cn("flex min-h-0 flex-col overflow-hidden", bodyClassName)}
      >
        {children}
      </div>
      <div
        data-slot="drawer-shell-footer"
        className={cn("min-h-0", footerClassName)}
      >
        {footer}
      </div>
    </div>
  );
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  DrawerShell,
};
