import type { Metadata } from "next";
import { MailPageContent } from "./_client";

export const metadata: Metadata = {
  title: "Mail – Solace",
  description: "Read and send mail in Solace.",
};

export default function MailPage() {
  return <MailPageContent />;
}
