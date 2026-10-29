import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { Passkey as AuthPasskey } from "@better-auth/passkey/client";
import {
  EVENT_ENCRYPTION_HINT,
  getErrorMessage,
} from "@workspace/calendar-core";
import { SettingsPage } from "../SettingsPage";
import { useMailSkin, type MailSkin } from "../../mail/mail-ui";
import {
  SheetGroup,
  SheetItem,
  SheetScroll,
  SheetSection,
  SheetSwitchItem,
} from "../../sheet/SheetSections";
import { authClient } from "../../../lib/auth-client";
import { getAuthCapabilities } from "../../../lib/auth-capabilities";
import { formatStoredPasskeyDescription } from "../../../lib/passkey-auth";
import {
  isPasskeyBridgeOriginSecure,
  resolvePasskeyBridgeBaseUrl,
} from "../../../lib/passkey-browser-bridge";
import {
  isNativeTitleIndexEnabled,
  setNativeTitleIndexEnabled,
  subscribeNativeTitleIndexEnabled,
} from "../../../lib/search/title-index-store";
import { useAuth } from "../../../providers/AuthProvider";
import { useTheme } from "../../../providers/ThemeProvider";
import { useToast } from "../../../providers/ToastProvider";

export function SecuritySettingsContent() {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = useMemo(() => createStyles(skin), [skin]);
  const { registerPasskey, deletePasskey } = useAuth();
  const { toast } = useToast();
  const passkeysQuery = authClient.useListPasskeys();

  const authCapabilities = useMemo(() => {
    const passkeyBridgeBaseUrl = resolvePasskeyBridgeBaseUrl();
    return getAuthCapabilities({
      platformOs: Platform.OS,
      hasPublicKeyCredential:
        typeof globalThis.PublicKeyCredential === "function",
      hasSecurePasskeyBridgeOrigin:
        isPasskeyBridgeOriginSecure(passkeyBridgeBaseUrl),
    });
  }, []);

  const isPasskeySupported = authCapabilities.supportsPasskeys;
  const passkeySupportMessage =
    authCapabilities.passkeyMessage ??
    "Passkeys are unavailable in the current runtime.";
  const storedPasskeys = useMemo(
    () => (Array.isArray(passkeysQuery.data) ? passkeysQuery.data : []),
    [passkeysQuery.data],
  );

  const [titleIndexEnabled, setTitleIndexEnabled] = useState(true);
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);
  const [pendingPasskeyDeletionId, setPendingPasskeyDeletionId] = useState<
    string | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    void isNativeTitleIndexEnabled()
      .then((value) => {
        if (!cancelled) setTitleIndexEnabled(value);
      })
      .catch(() => {
        // A failed read keeps the safe default (index on); the switch stays at its last value.
      });
    const unsubscribe = subscribeNativeTitleIndexEnabled(setTitleIndexEnabled);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const handleRegisterPasskey = useCallback(async () => {
    setIsRegisteringPasskey(true);
    try {
      await registerPasskey();
      await passkeysQuery.refetch();
      toast("Passkey added");
    } catch (error) {
      toast(getErrorMessage(error, "Failed to add passkey"), "error");
    } finally {
      setIsRegisteringPasskey(false);
    }
  }, [passkeysQuery, registerPasskey, toast]);

  const handleDeletePasskey = useCallback(
    (passkey: AuthPasskey) => {
      const passkeyLabel = passkey.name || "this passkey";
      Alert.alert(
        "Delete passkey?",
        `Remove ${passkeyLabel} from your account?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              setPendingPasskeyDeletionId(passkey.id);
              deletePasskey(passkey.id)
                .then(() => {
                  passkeysQuery.refetch();
                  toast("Passkey removed");
                })
                .catch((error) => {
                  toast(
                    getErrorMessage(error, "Failed to delete passkey"),
                    "error",
                  );
                })
                .finally(() => {
                  setPendingPasskeyDeletionId(null);
                });
            },
          },
        ],
      );
    },
    [deletePasskey, passkeysQuery, toast],
  );

  const passkeyFooter = !isPasskeySupported
    ? Platform.OS === "web"
      ? passkeySupportMessage
      : `${passkeySupportMessage} Native passkeys also need the passkey domain, apple-app-site-association, and assetlinks setup to match your build.`
    : storedPasskeys.length === 0
      ? "No passkeys saved yet. Add one to sign in with Face ID, Touch ID, or your device credential manager."
      : undefined;

  return (
    <SettingsPage title="Security">
      <SheetScroll>
        <SheetSection title="Encryption" footer={EVENT_ENCRYPTION_HINT}>
          <SheetGroup>
            <SheetSwitchItem
              key="title-index"
              icon="search"
              label="On-device search index"
              detail="Keep encrypted titles of your mail and events, and the start of each message, on this device so older items stay searchable."
              value={titleIndexEnabled}
              onValueChange={(value) => {
                setTitleIndexEnabled(value);
                void setNativeTitleIndexEnabled(value).catch(() =>
                  toast("Could not save the search index setting.", "error"),
                );
              }}
            />
          </SheetGroup>
        </SheetSection>

        <SheetSection title="Passkeys" footer={passkeyFooter}>
          {isPasskeySupported ? (
            <SheetGroup>
              <SheetItem
                key="add-passkey"
                icon="key"
                label="Add Passkey"
                detail={
                  storedPasskeys.length > 0
                    ? `${storedPasskeys.length} saved on your account`
                    : "Use this device for faster, passwordless sign-in."
                }
                pending={isRegisteringPasskey}
                onPress={handleRegisterPasskey}
              />
              {storedPasskeys.map((passkey) => (
                <SheetItem
                  key={passkey.id}
                  icon="key"
                  label={passkey.name || "Unnamed Passkey"}
                  detail={formatStoredPasskeyDescription(passkey)}
                  pending={pendingPasskeyDeletionId === passkey.id}
                  // oxlint-disable-next-line react-doctor/jsx-no-jsx-as-prop -- SheetItem is not memoized, so a fresh element costs nothing.
                  trailing={
                    <Pressable
                      onPress={() => handleDeletePasskey(passkey)}
                      style={({ pressed }) => [
                        styles.deleteButton,
                        pressed && styles.deleteButtonPressed,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${passkey.name || "passkey"}`}
                    >
                      <Feather name="trash-2" size={16} color={theme.colors.destructive} />
                    </Pressable>
                  }
                />
              ))}
            </SheetGroup>
          ) : null}
        </SheetSection>
      </SheetScroll>
    </SettingsPage>
  );
}

function createStyles(skin: MailSkin) {
  return StyleSheet.create({
    deleteButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    deleteButtonPressed: {
      backgroundColor: skin.selected,
    },
  } satisfies Record<string, ViewStyle>);
}
