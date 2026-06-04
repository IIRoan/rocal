import { Stack } from "expo-router";
import { NATIVE_STACK_SCREEN_OPTIONS } from "../../src/lib/navigation-routes";

export default function CalendarManageLayout() {
  return <Stack screenOptions={NATIVE_STACK_SCREEN_OPTIONS} />;
}
