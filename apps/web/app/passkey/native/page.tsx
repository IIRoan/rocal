import type { Metadata } from "next";
import { NativePasskeyBridgeContent } from "./_content";

export const metadata: Metadata = {
  title: "Passkey",
};

export default function NativePasskeyBridgePage() {
  return <NativePasskeyBridgeContent />;
}
