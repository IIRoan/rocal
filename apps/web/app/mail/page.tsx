"use client";

import dynamic from "next/dynamic";

const MailApp = dynamic(
  () =>
    import("../../components/mail/mail-app").then((module) => module.MailApp),
  { ssr: false },
);

export default function MailPage() {
  return <MailApp />;
}
