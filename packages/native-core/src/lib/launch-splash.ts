import { SplashScreen } from "expo-router";

// Runs on import (before the first render) so expo-router does not hide the splash over the still-unthemed first frames.
void SplashScreen.preventAutoHideAsync();

/** Hides the native launch splash once the first themed screen can render. */
export function hideLaunchSplash(): void {
  SplashScreen.hide();
}
