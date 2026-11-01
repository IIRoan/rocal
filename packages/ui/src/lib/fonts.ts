import localFont from "next/font/local";

export const solaceSans = localFont({
  src: [
    {
      path: "../font/inter-font/web/InterVariable.woff2",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "../font/inter-font/web/InterVariable-Italic.woff2",
      weight: "100 900",
      style: "italic",
    },
  ],
  variable: "--font-sans",
  display: "swap",
  preload: true,
  fallback: [
    "Inter",
    "system-ui",
    "-apple-system",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
  adjustFontFallback: "Arial",
});
