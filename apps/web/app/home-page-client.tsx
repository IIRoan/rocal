"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import {
  Navbar,
  HeroSection,
  PricingSection,
  Footer,
} from "@workspace/ui/components/landing";

export function HomePageClient() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && session?.user) {
      router.replace("/dashboard");
    }
  }, [isPending, session?.user, router]);

  return (
    <div className="min-h-[100dvh] bg-background">
      <Navbar />
      <main>
        <HeroSection />
        <PricingSection />
      </main>
      <Footer />
    </div>
  );
}
