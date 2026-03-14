import type { Metadata } from "next";
import { HomePageClient } from "./home-page-client";

export const metadata: Metadata = {
  title: "Solace - The Smart Way to Manage Your Time",
  description: "A modern calendar and time management platform.",
};

export default function Page() {
  return <HomePageClient />;
}
