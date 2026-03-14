"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { Logo } from "@workspace/ui/components/layout";
import { Button } from "@workspace/ui/components/ui";

export function HomePageClient() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && session?.user) {
      router.replace("/dashboard");
    }
  }, [isPending, session?.user, router]);

  if (isPending) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
      </div>
    );
  }

  if (session?.user) {
    return null;
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center gap-6 text-center">
        <Logo width={64} height={64} className="text-primary" />
        <h1 className="text-3xl font-semibold">Solace</h1>
        <p className="text-muted-foreground">
          The smart way to manage your time
        </p>
        <Button size="lg" onClick={() => router.push("/login")}>
          Go to Login
        </Button>
      </div>
    </div>
  );
}
