import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginLoading } from "./_content";
import { LoginForm } from "./login-form-entry";

export const metadata: Metadata = {
  title: "Sign in – Solace",
  description: "Sign in to Solace to access your calendar and mail.",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginForm />
    </Suspense>
  );
}
