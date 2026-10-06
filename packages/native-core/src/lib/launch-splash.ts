import { SplashScreen } from "expo-router";

// Runs on import (before the first render) so expo-router does not hide the splash over the still-unthemed first frames.
// If auto-hide cannot be prevented, expo-router simply keeps managing the splash itself.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Hides the native launch splash once the first themed screen can render. */
export function hideLaunchSplash(): void {
  SplashScreen.hide();
}
