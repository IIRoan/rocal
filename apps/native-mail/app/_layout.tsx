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
import type { NotificationExtensionSecrets } from "@workspace/native-core/hooks/use-notification-extension-sync";
import {
  NATIVE_ROOT_NON_GESTURE_SCREEN_OPTIONS,
  NATIVE_STACK_SCREEN_OPTIONS,
} from "@workspace/native-core/lib/navigation-routes";
import { MailComposeProvider } from "../src/providers/MailComposeProvider";
import { MailSelectionProvider } from "../src/providers/MailSelectionProvider";
import { CommandPalette } from "../src/components/CommandPalette";
import { MAIL_HOME_ROUTE, MAIL_PUSH_TAP_HANDLER } from "../src/lib/mail-routes";
import { MAIL_AUTH_LIFECYCLE, prepareMailSession } from "../src/lib/mail-session";

/** Mail pushes only carry ids, so the extension needs the session to fetch sender and subject, never the title key. */
const NOTIFICATION_EXTENSION_SECRETS: NotificationExtensionSecrets = {
  mailAuth: true,
  notificationKey: false,
};

function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryProvider>
        <AuthProvider lifecycle={MAIL_AUTH_LIFECYCLE}>
          <PushProvider>
            <ThemeProvider>
              <AppUpdateProvider>
                <AppUpdateScreen />
                <E2eeProvider>
                  <MailSelectionProvider>
                    <NavigationGuard
                      homeRoute={MAIL_HOME_ROUTE}
                      prepareSession={prepareMailSession}
                      pushTapHandler={MAIL_PUSH_TAP_HANDLER}
                      notificationExtensionSecrets={
                        NOTIFICATION_EXTENSION_SECRETS
                      }
                    >
                      <ToastProvider>
                        <MailComposeProvider>
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
                                name="mail"
                                options={NATIVE_ROOT_NON_GESTURE_SCREEN_OPTIONS}
                              />
                            </Stack>
                            <AuthenticatedChrome>
                              <CommandPalette />
                            </AuthenticatedChrome>
                          </CommandPaletteProvider>
                        </MailComposeProvider>
                      </ToastProvider>
                    </NavigationGuard>
                  </MailSelectionProvider>
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
