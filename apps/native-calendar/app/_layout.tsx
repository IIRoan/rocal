import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Stack } from "expo-router";
import "@workspace/native-core/lib/install-native-crypto";
import { QueryProvider } from "@workspace/native-core/providers/QueryProvider";
import { AuthProvider } from "@workspace/native-core/providers/AuthProvider";
import { PushProvider } from "@workspace/native-core/providers/PushProvider";
import { ThemeProvider } from "@workspace/native-core/providers/ThemeProvider";
import { AppUpdateProvider } from "@workspace/native-core/providers/AppUpdateProvider";
import { AppUpdateScreen } from "@workspace/native-core/components/settings/AppUpdateScreen";
import { E2eeProvider } from "@workspace/native-core/providers/E2eeProvider";
import { ToastProvider } from "@workspace/native-core/providers/ToastProvider";
import { CommandPaletteProvider } from "@workspace/native-core/providers/CommandPaletteProvider";
import {
  AuthenticatedChrome,
  NavigationGuard,
} from "@workspace/native-core/providers/NavigationGuard";
import { enforceFullEventEncryption } from "@workspace/native-core/lib/startup-crypto";
import type { NotificationExtensionSecrets } from "@workspace/native-core/hooks/use-notification-extension-sync";
import {
  NATIVE_ROOT_NON_GESTURE_SCREEN_OPTIONS,
  NATIVE_STACK_SCREEN_OPTIONS,
} from "@workspace/native-core/lib/navigation-routes";
import { SheetProvider } from "../src/providers/SheetProvider";
import { CalendarViewProvider } from "../src/providers/CalendarViewProvider";
import { CommandPalette } from "../src/components/CommandPalette";
import {
  CALENDAR_HOME_ROUTE,
  CALENDAR_PUSH_TAP_HANDLER,
} from "../src/lib/calendar-routes";

/** Calendar pushes are reminders, so the extension only needs the title key, never the session cookie. */
const NOTIFICATION_EXTENSION_SECRETS: NotificationExtensionSecrets = {
  mailAuth: false,
  notificationKey: true,
};

function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryProvider>
        <AuthProvider>
          <PushProvider>
            <ThemeProvider>
              <AppUpdateProvider>
                <AppUpdateScreen />
                <E2eeProvider>
                  <CalendarViewProvider>
                    <NavigationGuard
                      homeRoute={CALENDAR_HOME_ROUTE}
                      prepareSession={enforceFullEventEncryption}
                      pushTapHandler={CALENDAR_PUSH_TAP_HANDLER}
                      notificationExtensionSecrets={
                        NOTIFICATION_EXTENSION_SECRETS
                      }
                    >
                      <ToastProvider>
                        <SheetProvider>
                          <CommandPaletteProvider>
                            <Stack screenOptions={NATIVE_STACK_SCREEN_OPTIONS}>
                              <Stack.Screen
                                name="index"
                                options={NATIVE_ROOT_NON_GESTURE_SCREEN_OPTIONS}
                              />
                              <Stack.Screen
                                name="(auth)"
                                options={NATIVE_ROOT_NON_GESTURE_SCREEN_OPTIONS}
                              />
                              <Stack.Screen
                                name="calendar"
                                options={NATIVE_ROOT_NON_GESTURE_SCREEN_OPTIONS}
                              />
                            </Stack>
                            <AuthenticatedChrome>
                              <CommandPalette />
                            </AuthenticatedChrome>
                          </CommandPaletteProvider>
                        </SheetProvider>
                      </ToastProvider>
                    </NavigationGuard>
                  </CalendarViewProvider>
                </E2eeProvider>
              </AppUpdateProvider>
            </ThemeProvider>
          </PushProvider>
        </AuthProvider>
      </QueryProvider>
    </GestureHandlerRootView>
  );
}

export default RootLayout;
