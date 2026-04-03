/// <reference types="uniwind/types" />

import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { Text } from "react-native";
import { MobilePage } from "@workspace/mobile-ui";
import { createLogger } from "@workspace/logger";

const logger = createLogger("solace-app:home");

export default function App() {
  useEffect(() => {
    logger.info("Home screen mounted");
  }, []);

  return (
    <MobilePage>
      <Text className="text-3xl font-bold text-center mt-16 text-green">
        Solace App
      </Text>
      <Text className="text-base text-center mt-3 px-6 text-neutral-600">
        Using @workspace/mobile-ui and @workspace/logger from the monorepo.
      </Text>
      <StatusBar style="dark" />
    </MobilePage>
  );
}
