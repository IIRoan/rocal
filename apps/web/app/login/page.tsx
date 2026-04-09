import { Suspense } from "react";
import { LoginForm, LoginLoading } from "./_content";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginForm />
    </Suspense>
  );
}
