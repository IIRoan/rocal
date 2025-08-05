import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@workspace/ui/components/ui";
import { ThemeProvider } from "@workspace/ui/providers";
import { CalendarProvider } from "@workspace/ui/components/calendar";
import { SettingsProvider } from "@/components/settings-provider";
import type { Metadata } from "next";
import "@workspace/ui/globals.css";

const fontSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const fontMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rocal",
  description: "Calendar application",
  manifest: "/manifest.json",
  themeColor: "#000000",
  viewport: "width=device-width, initial-scale=1, user-scalable=no, viewport-fit=cover",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Rocal",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "Rocal",
    "mobile-web-app-capable": "yes",
    "application-name": "Rocal",
    "msapplication-TileColor": "#000000",
    "msapplication-tap-highlight": "no",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fontSans.variable} ${fontMono.variable} bg-background font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <SettingsProvider>
            <CalendarProvider>{children}</CalendarProvider>
            <Toaster />
          </SettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
