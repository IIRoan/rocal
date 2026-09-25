import { SettingsHomeScreen } from "@workspace/native-core/screens/SettingsHomeScreen";

const HIDDEN_SECTIONS = ["calendar"] as const;

export default function SettingsScreen() {
  return <SettingsHomeScreen hiddenSections={HIDDEN_SECTIONS} />;
}
