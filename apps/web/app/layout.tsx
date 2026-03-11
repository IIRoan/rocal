import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@workspace/ui/components/ui";
import { ThemeProvider, LoadingProvider } from "@workspace/ui/providers";
import { CalendarProvider } from "@workspace/ui/components/calendar";
import { SettingsProvider } from "@/components/settings-provider";
import { QueryProvider } from "@/components/query-provider";
import type { Metadata, Viewport } from "next";
import "./globals.css";

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
  description: "Calendar",
  manifest: "/manifest.json",
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  userScalable: false,
  themeColor: "#000000",
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
        <QueryProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <LoadingProvider>
              <SettingsProvider>
                <CalendarProvider>{children}</CalendarProvider>
                <Toaster />
              </SettingsProvider>
            </LoadingProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
