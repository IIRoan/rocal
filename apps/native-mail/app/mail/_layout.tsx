import { Stack } from "expo-router";
import { NATIVE_STACK_SCREEN_OPTIONS } from "@workspace/native-core/lib/navigation-routes";
import { WorkspaceThemeScope } from "@workspace/native-core/providers/ThemeProvider";

export default function MailLayout() {
  return (
    <WorkspaceThemeScope>
      <Stack screenOptions={NATIVE_STACK_SCREEN_OPTIONS} />
    </WorkspaceThemeScope>
  );
}
