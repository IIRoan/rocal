import { Suspense } from "react";
import { MobileAuthCompleteContent, MobileAuthLoading } from "./_content";

export default function MobileAuthCompletePage() {
  return (
    <Suspense fallback={<MobileAuthLoading />}>
      <MobileAuthCompleteContent />
    </Suspense>
  );
}
