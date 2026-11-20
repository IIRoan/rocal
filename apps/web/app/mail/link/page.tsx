import type { Metadata } from "next";
import { MailLinkPageContent } from "./_client";

export const metadata: Metadata = {
  title: "Open link",
  referrer: "no-referrer",
  robots: { index: false },
};

export default function MailLinkPage() {
  return <MailLinkPageContent />;
}
