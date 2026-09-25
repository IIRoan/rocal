"use client";

type MobileRuntimeBridgeProps = {
  children: React.ReactNode;
};

/**
 * Previously handled web-based mobile runtime setup. The native apps now live
 * in apps/native-calendar and apps/native-mail, so this component is a simple passthrough for the web app.
 */
export function MobileRuntimeBridge({ children }: MobileRuntimeBridgeProps) {
  return <>{children}</>;
}
