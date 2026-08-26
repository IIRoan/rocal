import { createLogger } from "@workspace/logger";
import type { QueryClient } from "@tanstack/react-query";
import type { UpdateSettingsRequest, UserSettings } from "@/lib/types/calendar";
import { calendarApiService } from "@/lib/calendar-api-service";
import { authClient, signOut } from "@/lib/auth-client";
import { resetEncryptionPasswordForActiveSession } from "@/lib/e2ee-password-reset";

const log = createLogger("command-palette");

export function toUpdateSettingsRequest(
  settings: UserSettings,
): UpdateSettingsRequest {
  return {
    theme: settings.theme,
    defaultView: settings.defaultView,
    weekStartDay: settings.weekStartDay,
    timezone: settings.timezone,
    timeFormat: settings.timeFormat,
    workingHoursStart: settings.workingHoursStart,
    workingHoursEnd: settings.workingHoursEnd,
    workingDays: settings.workingDays,
    emailNotifications: settings.emailNotifications,
    pushNotifications: settings.pushNotifications,
    browserNotifications: settings.browserNotifications,
    reminderSound: settings.reminderSound,
    eventEncryptionMode: settings.eventEncryptionMode,
    defaultEventDuration: settings.defaultEventDuration,
    defaultCalendarId: settings.defaultCalendarId,
    compactView: settings.compactView,
    showWeekNumbers: settings.showWeekNumbers,
    showDeclinedEvents: settings.showDeclinedEvents,
  };
}

export async function persistSettingsUpdate(input: {
  updateSettings: (data: UpdateSettingsRequest) => Promise<unknown>;
  next: UserSettings;
}): Promise<{ ok: true } | { ok: false }> {
  try {
    await input.updateSettings(toUpdateSettingsRequest(input.next));
    return { ok: true };
  } catch (err) {
    log.error("Failed to save settings:", err);
    return { ok: false };
  }
}

export async function persistSettingsReset(input: {
  resetSettings: () => Promise<unknown>;
}): Promise<{ ok: true } | { ok: false }> {
  try {
    await input.resetSettings();
    return { ok: true };
  } catch (err) {
    log.error("Failed to reset settings:", err);
    return { ok: false };
  }
}

export async function persistAccountDeletion(input: {
  queryClient: QueryClient;
}): Promise<{ ok: true } | { ok: false }> {
  try {
    await calendarApiService.deleteAccount();
    input.queryClient.clear();
    try {
      await signOut();
    } catch {
      // The session may already be invalid after the account is removed.
    }
    return { ok: true };
  } catch (err) {
    log.error("Failed to delete account:", err);
    return { ok: false };
  }
}

export async function persistPasswordChange(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: true } | { ok: false; error: unknown }> {
  try {
    const result = await authClient.changePassword({
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    });

    if (result?.error) {
      throw new Error(
        result.error.message || "Unable to update your password.",
      );
    }
    return { ok: true };
  } catch (error) {
    log.error("Failed to change password:", error);
    return { ok: false, error };
  }
}

export async function persistPasswordSet(input: {
  newPassword: string;
  refetchAccounts?: () => Promise<unknown>;
}): Promise<{ ok: true } | { ok: false; error: unknown }> {
  try {
    const result = await authClient.setPassword({
      newPassword: input.newPassword,
    });

    if (result?.error) {
      throw new Error(result.error.message || "Unable to set your password.");
    }

    await input.refetchAccounts?.();
    return { ok: true };
  } catch (error) {
    log.error("Failed to set password:", error);
    return { ok: false, error };
  }
}

export async function persistEncryptionPasswordReset(input: {
  sessionUserId: string;
  newPassword: string;
}): Promise<{ ok: true } | { ok: false; error: unknown }> {
  try {
    const stored = await resetEncryptionPasswordForActiveSession(
      input.sessionUserId,
      input.newPassword,
    );

    if (!stored) {
      throw new Error(
        "Unlock your encrypted data on this device first, then try again.",
      );
    }
    return { ok: true };
  } catch (error) {
    log.error("Failed to reset encryption password:", error);
    return { ok: false, error };
  }
}

export async function persistProfileUpdate(input: {
  imageUrl?: string;
}): Promise<
  { ok: true; image: string | null } | { ok: false; error: unknown }
> {
  try {
    const result = await authClient.updateUser({
      image: input.imageUrl ?? null,
    });
    if (result?.error) {
      throw new Error(
        result.error.message || "Unable to update your profile.",
      );
    }
    return { ok: true, image: input.imageUrl?.trim() || null };
  } catch (error) {
    log.error("Failed to update profile:", error);
    return { ok: false, error };
  }
}
