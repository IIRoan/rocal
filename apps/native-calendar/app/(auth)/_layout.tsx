import { Stack } from "expo-router";
import { NATIVE_STACK_SCREEN_OPTIONS } from "@workspace/native-core/lib/navigation-routes";

export default function AuthLayout() {
  return <Stack screenOptions={NATIVE_STACK_SCREEN_OPTIONS} />;
}
