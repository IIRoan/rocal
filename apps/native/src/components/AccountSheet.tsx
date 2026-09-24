import React, { useCallback, useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../providers/ThemeProvider";
import { useAuth } from "../providers/AuthProvider";
import { useToast } from "../providers/ToastProvider";
import { BottomSheet } from "./BottomSheet";
import { BlobatarAvatar } from "./BlobatarAvatar";
import { WorkspaceAppSwitch } from "./WorkspaceAppSwitch";
import { SheetPageStack, SheetSubPage, useSheetPageStack } from "./sheet/SheetPageStack";
import {
  SheetGroup,
  SheetItem,
  SheetScroll,
  SheetSection,
} from "./sheet/SheetSections";
import { SettingsSheetPageProvider } from "./settings/SettingsPage";
import {
  SETTINGS_SHEET_PAGES,
  settingsSheetPageTitle,
} from "./settings/sections";
import { CalendarsSheetContent } from "./calendars/CalendarsSheet";
import { buildAccountSheetGroups } from "../lib/account-sheet-model";
import { CALENDARS_ROOT_PAGE, isCalendarsSheetPage } from "../lib/calendars-sheet-pages";
import { SETTINGS_HUB_ICONS, SETTINGS_MAIL_ICONS } from "../lib/settings-nav-icons";
import { useDeferredSheetAction } from "../hooks/use-deferred-sheet-action";
import type { AppSwitchKey } from "../lib/app-switcher-config";
import { useWorkspaceTabSwitch } from "../lib/use-workspace-tab-switch";

const ROW_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  ...SETTINGS_HUB_ICONS,
  ...SETTINGS_MAIL_ICONS,
  [CALENDARS_ROOT_PAGE]: "calendar",
  calendar: "settings",
};

const ROOT_PAGE = "root";
const SETTINGS_GROUPS = buildAccountSheetGroups();

interface AccountSheetProps {
  visible: boolean;
  activeApp: AppSwitchKey;
  onDismiss: () => void;
}

/** Account drawer: profile, app switch, and settings that open in-sheet. */
export function AccountSheet({ visible, activeApp, onDismiss }: AccountSheetProps) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { toast } = useToast();
  const { push: routerPush } = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { runAfterClose, onCloseComplete } = useDeferredSheetAction(onDismiss);
  const switchTab = useWorkspaceTabSwitch();

  const pageStack = useSheetPageStack(ROOT_PAGE, visible);
  const { push: pushStackPage, pop: popPage, reset: resetPageStack } = pageStack;

  const pushPage = useCallback(
    (pagePath: string) => {
      const id = pagePath.split("/").filter(Boolean).pop() ?? ROOT_PAGE;
      if (!SETTINGS_SHEET_PAGES[id] && !isCalendarsSheetPage(id)) {
        runAfterClose(() => routerPush(pagePath as never));
        return;
      }
      pushStackPage(id);
    },
    [pushStackPage, routerPush, runAfterClose],
  );

  const displayName = user?.name || user?.email?.split("@")[0] || "";

  const copyEmail = async () => {
    if (!user?.email) return;
    await Clipboard.setStringAsync(user.email);
    toast("Email copied");
  };

  const rootList = (
    <SheetScroll>
      <View style={styles.profile}>
        <BlobatarAvatar
          email={user?.email}
          name={user?.name}
          src={user?.image}
          size={72}
          borderRadius={theme.borderRadius.xl}
        />
        <Text style={styles.name} numberOfLines={1}>
          {displayName}
        </Text>
        {user?.email ? (
          <Pressable
            onPress={() => void copyEmail()}
            hitSlop={8}
            style={({ pressed }) => [styles.emailRow, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Copy email address"
          >
            <Text style={styles.email} numberOfLines={1}>
              {user.email}
            </Text>
            <Feather name="copy" size={13} color={theme.colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>

      <WorkspaceAppSwitch
        activeApp={activeApp}
        onSwitch={(app) => runAfterClose(() => switchTab(app))}
      />

      {SETTINGS_GROUPS.map((group) => (
        <SheetSection key={group.title} title={group.title}>
          <SheetGroup>
            {group.rows.map((row) => (
              <SheetItem
                key={row.id}
                label={row.label}
                icon={ROW_ICONS[row.id] ?? "settings"}
                chevron
                onPress={() => pushPage(row.route)}
                accessibilityLabel={row.label}
              />
            ))}
          </SheetGroup>
        </SheetSection>
      ))}
    </SheetScroll>
  );

  const renderPage = (pageId: string) => {
    if (pageId === ROOT_PAGE) {
      return rootList;
    }
    const Content = SETTINGS_SHEET_PAGES[pageId];
    if (!Content) {
      return isCalendarsSheetPage(pageId) ? (
        <CalendarsSheetContent pageId={pageId} rootBackLabel="Back to settings" />
      ) : null;
    }
    return (
      <SheetSubPage title={settingsSheetPageTitle(pageId)} backLabel="Back to settings">
        <Content />
      </SheetSubPage>
    );
  };

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      onCloseComplete={() => {
        resetPageStack();
        onCloseComplete();
      }}
      snapPoints={[0.92]}
    >
      <SettingsSheetPageProvider push={pushPage} back={popPage}>
        <SheetPageStack state={pageStack} renderPage={renderPage} />
      </SettingsSheetPageProvider>
    </BottomSheet>
  );
}

function createStyles(theme: ThemeTokens) {
  const view = {
    profile: {
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      paddingTop: theme.spacing["2"],
    },
    emailRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      maxWidth: "90%" as const,
    },
    pressed: {
      opacity: 0.6,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    name: {
      marginTop: theme.spacing["2"],
      fontSize: 18,
      lineHeight: 24,
      fontWeight: "700" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    email: {
      flexShrink: 1,
      fontSize: 14,
      lineHeight: 19,
      color: theme.colors.mutedForeground,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
