import React, {
  useCallback,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
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
import { settingsSectionPath } from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../providers/ThemeProvider";
import { useAuth } from "../providers/AuthProvider";
import { useToast } from "../providers/ToastProvider";
import { BottomSheet } from "./BottomSheet";
import { BlobatarAvatar } from "./BlobatarAvatar";
import {
  SheetPageStack,
  SheetSubPage,
  useSheetPageStack,
} from "./sheet/SheetPageStack";
import {
  SheetCenteredState,
  SheetGroup,
  SheetItem,
  SheetScroll,
  SheetSearchField,
  SheetSection,
} from "./sheet/SheetSections";
import { SettingsSheetPageProvider } from "./settings/SettingsPage";
import { settingsSheetPageTitle } from "./settings/sections";
import {
  filterAccountSheetGroups,
  filterAccountSheetSearchEntries,
  type AccountSheetGroup,
  type AccountSheetSearchEntry,
} from "../lib/account-sheet-model";
import { useDeferredSheetAction } from "../hooks/use-deferred-sheet-action";

const ROOT_PAGE = "root";

/** App-specific drawer contents: which settings rows exist and which pages open in-sheet. */
export interface AccountSheetConfig {
  groups: AccountSheetGroup[];
  /** Individual settings inside the pages, so search can find them too. */
  searchEntries?: AccountSheetSearchEntry[];
  pages: Record<string, ComponentType>;
  icons: Readonly<Record<string, keyof typeof Feather.glyphMap>>;
  labels?: Readonly<Record<string, string | undefined>>;
  /** Extra in-sheet page stacks (e.g. calendars management) that render their own sub-pages. */
  customPages?: {
    isPage: (pageId: string) => boolean;
    render: (pageId: string) => ReactNode;
  };
}

interface AccountSheetProps {
  visible: boolean;
  config: AccountSheetConfig;
  onDismiss: () => void;
}

/** Account drawer: profile and settings that open in-sheet. */
export function AccountSheet({
  visible,
  config,
  onDismiss,
}: AccountSheetProps) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { toast } = useToast();
  const { push: routerPush } = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { runAfterClose, onCloseComplete } = useDeferredSheetAction(onDismiss);

  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;
  const visibleGroups = useMemo(
    () => filterAccountSheetGroups(config.groups, query),
    [config.groups, query],
  );

  const visibleEntries = useMemo(
    () =>
      filterAccountSheetSearchEntries(
        (config.searchEntries ?? []).filter(
          (entry) =>
            config.pages[entry.pageId] ||
            config.customPages?.isPage(entry.pageId),
        ),
        query,
      ),
    [config, query],
  );

  const pageStack = useSheetPageStack(ROOT_PAGE, visible);
  const {
    push: pushStackPage,
    pop: popPage,
    reset: resetPageStack,
  } = pageStack;

  const pushPage = useCallback(
    (pagePath: string) => {
      const id = pagePath.split("/").filter(Boolean).pop() ?? ROOT_PAGE;
      if (!config.pages[id] && !config.customPages?.isPage(id)) {
        runAfterClose(() => routerPush(pagePath as never));
        return;
      }
      pushStackPage(id);
    },
    [config, pushStackPage, routerPush, runAfterClose],
  );

  const displayName = user?.name || user?.email?.split("@")[0] || "";

  const copyEmail = async () => {
    if (!user?.email) return;
    await Clipboard.setStringAsync(user.email);
    toast("Email copied");
  };

  const rootList = (
    <SheetScroll>
      {searching ? null : (
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
              style={({ pressed }) => [
                styles.emailRow,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Copy email address"
            >
              <Text style={styles.email} numberOfLines={1}>
                {user.email}
              </Text>
              <Feather
                name="copy"
                size={13}
                color={theme.colors.mutedForeground}
              />
            </Pressable>
          ) : null}
        </View>
      )}

      <SheetSearchField
        value={query}
        onChangeText={setQuery}
        placeholder="Search settings"
        accessibilityLabel="Search settings"
      />

      {visibleGroups.length === 0 && visibleEntries.length === 0 ? (
        <SheetCenteredState message="No settings match your search." />
      ) : (
        visibleGroups.map((group) => (
          <SheetSection key={group.title} title={group.title}>
            <SheetGroup>
              {group.rows.map((row) => (
                <SheetItem
                  key={row.id}
                  label={row.label}
                  detail={searching ? row.description : undefined}
                  icon={config.icons[row.id] ?? "settings"}
                  chevron
                  onPress={() => pushPage(row.route)}
                  accessibilityLabel={row.label}
                />
              ))}
            </SheetGroup>
          </SheetSection>
        ))
      )}

      {visibleEntries.length > 0 ? (
        <SheetSection title="Settings">
          <SheetGroup>
            {visibleEntries.map((entry) => (
              <SheetItem
                key={`${entry.pageId}:${entry.location}:${entry.label}`}
                label={entry.label}
                detail={entry.location}
                icon={config.icons[entry.pageId] ?? "settings"}
                chevron
                onPress={() => pushPage(settingsSectionPath(entry.pageId))}
                accessibilityLabel={`${entry.label}, ${entry.location}`}
              />
            ))}
          </SheetGroup>
        </SheetSection>
      ) : null}
    </SheetScroll>
  );

  const renderPage = (pageId: string) => {
    if (pageId === ROOT_PAGE) {
      return rootList;
    }
    const Content = config.pages[pageId];
    if (!Content) {
      return config.customPages?.isPage(pageId)
        ? config.customPages.render(pageId)
        : null;
    }
    return (
      <SheetSubPage
        title={settingsSheetPageTitle(pageId, config.labels)}
        backLabel="Back to settings"
      >
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
        setQuery("");
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
