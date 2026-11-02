import type { Metadata } from "next";
import { HomeAppClient } from "./home-client";

export const metadata: Metadata = { title: "Home" };

export default function HomePage() {
  return <HomeAppClient />;
}
