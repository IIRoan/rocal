import { Suspense } from "react";
import type { Metadata } from "next";
import ResetPasswordContent from "./_content";

export const metadata: Metadata = {
  title: "Reset Password",
};

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}
