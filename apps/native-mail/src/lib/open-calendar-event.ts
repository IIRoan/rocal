import { Linking } from "react-native";
import Constants from "expo-constants";
import { calendarEventDeepLink } from "./mail-routes";

/** Hands the event to the Solace Calendar app; resolves false when it is not installed. */
export async function openCalendarEvent(eventId: string): Promise<boolean> {
  const extra = Constants.expoConfig?.extra as { appVariant?: unknown } | undefined;
  const variant = typeof extra?.appVariant === "string" ? extra.appVariant : null;
  try {
    await Linking.openURL(calendarEventDeepLink(eventId, variant));
    return true;
  } catch {
    return false;
  }
}
