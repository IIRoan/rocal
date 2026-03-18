"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard?palette=settings");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#14110f] px-4 text-[#f5f0e8]">
      <div className="max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-[#a49a8f]">
          Redirecting
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Opening your settings.
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#c8beb2]">
          You will be taken to the dashboard and the command palette will open on
          the settings search.
        </p>
      </div>
    </main>
  );
}
