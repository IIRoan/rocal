import { Stack } from "expo-router";
import { NATIVE_STACK_SCREEN_OPTIONS } from "../../../src/lib/navigation-routes";
import { WorkspaceThemeScope } from "../../../src/providers/ThemeProvider";

export default function MailLayout() {
  return (
    <WorkspaceThemeScope>
      <Stack screenOptions={NATIVE_STACK_SCREEN_OPTIONS} />
    </WorkspaceThemeScope>
  );
}
