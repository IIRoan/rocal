import { Tabs } from "expo-router";
import { StyleSheet, View } from "react-native";
import { WorkspaceTabPreloader } from "../../src/components/WorkspaceTabPreloader";
import { WorkspacePrimaryTabSurfaces } from "../../src/components/WorkspacePrimaryTabSurfaces";
import { useWorkspaceTabHost } from "../../src/providers/WorkspaceTabHostProvider";

function TabsChrome() {
  const { isHosted } = useWorkspaceTabHost();

  return (
    <View style={styles.root}>
      <WorkspaceTabPreloader />
      <WorkspacePrimaryTabSurfaces />
      <Tabs
        tabBar={() => null}
        screenOptions={{
          headerShown: false,
          lazy: false,
          freezeOnBlur: false,
          sceneStyle: isHosted ? styles.hiddenScene : undefined,
        }}
      >
        <Tabs.Screen
          name="calendar"
          options={{
            lazy: false,
            freezeOnBlur: false,
          }}
        />
        <Tabs.Screen
          name="mail"
          options={{
            lazy: false,
            freezeOnBlur: false,
          }}
        />
      </Tabs>
    </View>
  );
}

export default function TabsLayout() {
  return <TabsChrome />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  hiddenScene: {
    opacity: 0,
    pointerEvents: "none",
  },
});
