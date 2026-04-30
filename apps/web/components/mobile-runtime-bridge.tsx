"use client";

type MobileRuntimeBridgeProps = {
  children: React.ReactNode;
};

/**
 * Previously handled Capacitor native runtime setup (deep links, status bar,
 * keyboard, haptics, etc.). Now that the native app is built with Expo, this
 * component is a simple passthrough for the web app.
 */
export function MobileRuntimeBridge({ children }: MobileRuntimeBridgeProps) {
  return <>{children}</>;
}
