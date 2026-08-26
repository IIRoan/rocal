"use client";

import {
  ThemeProvider as NextThemesProvider,
  type ThemeProviderProps,
} from "next-themes";

// next-themes injects an inline <script> to prevent theme flicker before hydration.
// React 19 warns that client-rendered <script> tags are never executed; that warning
// is a false positive here — the script still runs correctly during SSR. Upstream:
// https://github.com/pacocoursey/next-themes/issues/385
// Same workaround as shadcn dark-mode docs.
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("Encountered a script tag")
    ) {
      return;
    }
    originalError.apply(console, args);
  };
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
