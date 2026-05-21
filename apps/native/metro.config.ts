import { getDefaultConfig } from "expo/metro-config";
import type { MetroConfig } from "expo/metro-config";

const config: MetroConfig = getDefaultConfig(
  new URL(".", import.meta.url).pathname,
);

export default config;
