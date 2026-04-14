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

export const solaceDisplay = localFont({
  src: [
    {
      path: "../font/inter-font/web/InterDisplay-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../font/inter-font/web/InterDisplay-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../font/inter-font/web/InterDisplay-Bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../font/inter-font/web/InterDisplay-Italic.woff2",
      weight: "400",
      style: "italic",
    },
    {
      path: "../font/inter-font/web/InterDisplay-SemiBoldItalic.woff2",
      weight: "600",
      style: "italic",
    },
    {
      path: "../font/inter-font/web/InterDisplay-BoldItalic.woff2",
      weight: "700",
      style: "italic",
    },
  ],
  variable: "--font-display",
  display: "swap",
  preload: false,
  fallback: ["Inter", "system-ui", "sans-serif"],
});