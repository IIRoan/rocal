import "../global.css";

import { Slot } from "expo-router";
import { installGlobalConsoleLogger } from "@workspace/logger";

installGlobalConsoleLogger("solace-app");

export default function Layout() {
  return <Slot />;
}
