import type { Metadata } from "next";
import { HomePageClient } from "./home-page-client";

export const metadata: Metadata = {
  title: "Rocani - The Smartest Way to Manage Your Time | AI-Powered Calendar",
  description:
    "Transform your productivity with Rocani's intelligent calendar platform. AI-powered scheduling, seamless team collaboration, and smart time analytics. Join 10,000+ teams worldwide. Start free today.",
};

export default function Page() {
  return <HomePageClient />;
}
