import * as React from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { cn } from "@workspace/ui/lib/utils";

type SheetSide = "top" | "right" | "bottom" | "left";

type SheetContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const SheetContext = React.createContext<SheetContextValue | null>(null);

function useSheetContext() {
  const context = React.useContext(SheetContext);
  if (!context) {
    throw new Error("Sheet components must be used within <Sheet>");
  }
  return context;
}

function Sheet({
  open,
  defaultOpen,
  onOpenChange,
  children,
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false);
  const isOpen = open ?? internalOpen;

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) {
        setInternalOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, open],
  );

  return (
    <SheetContext.Provider value={{ open: isOpen, setOpen }}>
      {children}
    </SheetContext.Provider>
  );
}

function SheetTrigger({
  onPress,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Pressable> & { className?: string }) {
  const { setOpen } = useSheetContext();

  return (
    <Pressable
      className={cn("min-h-11 min-w-11", className)}
      hitSlop={4}
      onPress={(event) => {
        setOpen(true);
        onPress?.(event);
      }}
      {...props}
    >
      {children}
    </Pressable>
  );
}

function SheetClose({
  onPress,
  className,
  children,
  ...props
}: React.ComponentProps<typeof Pressable> & { className?: string }) {
  const { setOpen } = useSheetContext();

  return (
    <Pressable
      className={cn("min-h-11 min-w-11", className)}
      hitSlop={4}
      onPress={(event) => {
        setOpen(false);
        onPress?.(event);
      }}
      {...props}
    >
      {children}
    </Pressable>
  );
}

function SheetPortal({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof Pressable> & { className?: string }) {
  return (
    <Pressable
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50 supports-[backdrop-filter]:backdrop-blur-sm",
        "absolute inset-0 bg-black/50",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  showClose = true,
  title,
  ...props
}: React.ComponentProps<typeof View> & {
  side?: SheetSide;
  showClose?: boolean;
  title?: string;
}) {
  const { open, setOpen } = useSheetContext();

  if (!open) {
    return null;
  }

  return (
    <SheetPortal>
      <Modal
        transparent
        visible={open}
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View className="flex-1">
          <SheetOverlay onPress={() => setOpen(false)} />
          <View
            className={cn(
              "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex flex-col gap-4 shadow-lg transition ease-[cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:duration-200 data-[state=open]:duration-300",
              side === "right" &&
                "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-[100dvh] w-3/4 border-l sm:max-w-sm absolute",
              side === "left" &&
                "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-[100dvh] w-3/4 border-r sm:max-w-sm absolute",
              side === "top" &&
                "data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b absolute",
              side === "bottom" &&
                "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t absolute",
              className,
            )}
            {...props}
          >
            <Text className="sr-only">{title ?? "Panel"}</Text>
            {children}
            {showClose && (
              <Pressable
                className="fixed top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] z-[100] flex h-10 w-10 min-h-11 min-w-11 items-center justify-center rounded-full bg-background/80 backdrop-blur-sm border border-border/50 text-foreground/80 hover:text-foreground hover:bg-background hover:scale-105 hover:shadow-sm focus-visible:scale-105 transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:hover:scale-100"
                hitSlop={4}
                onPress={() => setOpen(false)}
              >
                <Text className="text-foreground/80">×</Text>
                <Text className="sr-only">Close</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<typeof View>) {
  return (
    <View className={cn("flex flex-col gap-1.5 p-4", className)} {...props} />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<typeof View>) {
  return (
    <View className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />
  );
}

function SheetTitle({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Text>) {
  return (
    <Text className={cn("text-foreground font-semibold", className)} {...props}>
      {children}
    </Text>
  );
}

function SheetDescription({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Text>) {
  return (
    <Text className={cn("text-muted-foreground text-sm", className)} {...props}>
      {children}
    </Text>
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
