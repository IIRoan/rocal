"use client";

type MobileRuntimeBridgeProps = {
  children: React.ReactNode;
};

/**
 * Previously handled web-based mobile runtime setup. The native app now lives
 * in apps/native, so this component is a simple passthrough for the web app.
 */
export function MobileRuntimeBridge({ children }: MobileRuntimeBridgeProps) {
  return <>{children}</>;
}
