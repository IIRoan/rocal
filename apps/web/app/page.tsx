import type { Metadata } from "next";
import { HomePageClient } from "./home-page-client";

export const metadata: Metadata = {
  title: "Solace",
  description:
    "A calm calendar and a private inbox. Shared schedules, real notifications, and a mailbox that isn't a product.",
};

export default function Page() {
  return <HomePageClient />;
}
