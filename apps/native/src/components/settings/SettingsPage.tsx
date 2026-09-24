import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { AppScreen, StackScreenHeader } from "../layout";

interface SettingsPageContextValue {
  /** True when the page renders inside the account drawer instead of a route. */
  inSheet: boolean;
  /** In-sheet navigation; falls back to expo-router on standalone routes. */
  push: (page: string) => void;
  back: () => void;
}

const SettingsPageContext = createContext<SettingsPageContextValue | null>(
  null,
);

/** Provides in-sheet navigation to settings content rendered inside the account drawer. */
export function SettingsSheetPageProvider({
  push,
  back,
  children,
}: {
  push: (page: string) => void;
  back: () => void;
  children: ReactNode;
}) {
  const value = useMemo<SettingsPageContextValue>(
    () => ({ inSheet: true, push, back }),
    [push, back],
  );
  return (
    <SettingsPageContext.Provider value={value}>
      {children}
    </SettingsPageContext.Provider>
  );
}

/** True when settings content renders inside a drawer page stack. */
export function useInSettingsSheet(): boolean {
  return useContext(SettingsPageContext)?.inSheet ?? false;
}

/** Navigates to another settings page: in-sheet when available, otherwise router push. */
export function useSettingsNavigator(): (page: string) => void {
  const context = useContext(SettingsPageContext);
  const router = useRouter();
  const routePush = router.push;
  return useCallback(
    (page: string) => {
      if (context) {
        context.push(page);
      } else {
        routePush(page as never);
      }
    },
    [context, routePush],
  );
}

/** Goes back one settings page: pops the in-sheet stack, or router.back() on standalone routes. */
export function useSettingsBack(): () => void {
  const context = useContext(SettingsPageContext);
  const router = useRouter();
  const routeBack = router.back;
  return useCallback(() => {
    if (context) {
      context.back();
    } else {
      routeBack();
    }
  }, [context, routeBack]);
}

interface SettingsPageProps {
  title: string;
  onBack?: () => void;
  rightAction?: ReactNode;
  children: ReactNode;
}

/** Full-screen chrome on standalone routes, plain flex body inside the account drawer. */
export function SettingsPage({
  title,
  onBack,
  rightAction,
  children,
}: SettingsPageProps) {
  const inSheet = useInSettingsSheet();

  if (inSheet) {
    return <View style={styles.sheetBody}>{children}</View>;
  }

  return (
    <AppScreen
      header={
        <StackScreenHeader
          title={title}
          onBack={onBack}
          rightAction={rightAction}
        />
      }
    >
      {children}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  sheetBody: { flex: 1, minHeight: 0 },
});
