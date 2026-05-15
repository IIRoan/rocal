import type { Metadata } from "next";
import { HomeAppClient } from "./home-client";

export const metadata: Metadata = { title: "Home – Solace" };

export default function HomePage() {
  return <HomeAppClient />;
}
