"use client";

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";
import { StatusBar, Style } from "@capacitor/status-bar";
import { IonApp, setupIonicReact } from "@ionic/react";
import { usePathname } from "next/navigation";

setupIonicReact({
  mode: "ios",
});

const isNativePlatform = Capacitor.isNativePlatform();

type MobileRuntimeBridgeProps = {
  children: React.ReactNode;
};

export function MobileRuntimeBridge({ children }: MobileRuntimeBridgeProps) {
  const pathname = usePathname();
  const hasTriggeredInitialRouteRef = useRef(false);

  useEffect(() => {
    if (!isNativePlatform) {
      return;
    }

    document.body.classList.add("capacitor-app");

    let backButtonHandle: { remove: () => Promise<void> } | null = null;

    const initializeNativeRuntime = async () => {
      try {
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setOverlaysWebView({ overlay: true });
      } catch {
        // StatusBar plugin may be unavailable in desktop/browser contexts.
      }

      try {
        await Keyboard.setResizeMode({ mode: KeyboardResize.Body });
      } catch {
        // Keyboard plugin is only available in native mobile contexts.
      }

      backButtonHandle = await CapacitorApp.addListener(
        "backButton",
        ({ canGoBack }) => {
          if (canGoBack) {
            window.history.back();
            return;
          }

          if (Capacitor.getPlatform() === "android") {
            void CapacitorApp.exitApp();
          }
        },
      );
    };

    void initializeNativeRuntime();

    return () => {
      document.body.classList.remove("capacitor-app");
      if (backButtonHandle) {
        void backButtonHandle.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (!isNativePlatform) {
      return;
    }

    if (!hasTriggeredInitialRouteRef.current) {
      hasTriggeredInitialRouteRef.current = true;
      return;
    }

    void Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
  }, [pathname]);

  if (!isNativePlatform) {
    return <>{children}</>;
  }

  return <IonApp>{children}</IonApp>;
}
