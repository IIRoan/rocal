import { Suspense } from "react";
import { MobileLoginForm, MobileLoginLoading } from "./_content";

export default function MobileLoginPage() {
  return (
    <Suspense fallback={<MobileLoginLoading />}>
      <MobileLoginForm />
    </Suspense>
  );
}
