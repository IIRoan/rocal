import { Tabs } from "expo-router";
import { TabBar } from "../../src/components/TabBar";

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
        }}
      />
    </Tabs>
  );
}
