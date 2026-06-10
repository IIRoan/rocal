"use client";

import dynamic from "next/dynamic";

export const GsapAnimationProviderLazy = dynamic(
  () =>
    import("@workspace/ui/providers/gsap-animation-provider").then(
      (mod) => mod.GsapAnimationProvider,
    ),
  { ssr: false },
);
