"use client";

type MobileRuntimeBridgeProps = {
  children: React.ReactNode;
};

/** Legacy passthrough; the mobile runtimes now live in apps/native-calendar and apps/native-mail. */
export function MobileRuntimeBridge({ children }: MobileRuntimeBridgeProps) {
  return <>{children}</>;
}
