import { MobilePage } from "@workspace/mobile-ui";
import { Toaster } from "@workspace/ui/components/ui";
import {
  GsapAnimationProvider,
  ThemeProvider,
  LoadingProvider,
} from "@workspace/ui/providers";
import { CalendarProvider } from "@workspace/ui/components/calendar";
import { solaceDisplay, solaceSans } from "@workspace/ui/lib/fonts";
import { SettingsProvider } from "@/components/settings-provider";
import { QueryProvider } from "@/components/query-provider";
import { LoggerBootstrap } from "@/components/logger-bootstrap";
import { MobileRuntimeBridge } from "@/components/mobile-runtime-bridge";
import { RouteTransitionProvider } from "@/components/route-transition-provider";
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

const calendarBootstrapScript = `(function(){try{var root=document.documentElement;var params=new URLSearchParams(window.location.search);var rawDate=params.get("date");var match=rawDate&&/^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(rawDate);var date=match?new Date(Number(match[1]),Number(match[2])-1,Number(match[3]),12,0,0,0):new Date();if(Number.isNaN(date.getTime())){date=new Date()}var iso=date.toISOString();root.dataset.calendarBootstrapDate=iso;var parts={dayName:date.toLocaleDateString("en-US",{weekday:"long"}),dayNum:String(date.getDate()).padStart(2,"0"),monthName:date.toLocaleDateString("en-US",{month:"long"}),year:String(date.getFullYear())};var attempts=0;var applyParts=function(){var found=0;Object.entries(parts).forEach(function(entry){var key=entry[0];var value=entry[1];var nodes=document.querySelectorAll('[data-calendar-bootstrap="'+key+'"]').forEach(function(node){node.textContent=value;found+=1})});attempts+=1;if(found===0&&attempts<120){requestAnimationFrame(applyParts)}};applyParts()}catch(error){}})();`;

export const metadata: Metadata = {
  title: "Solace",
  description: "Calendar",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/favicon-512x512.png", sizes: "512x512", type: "image/png" },
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Solace",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "Solace",
    "mobile-web-app-capable": "yes",
    "application-name": "Solace",
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
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body
        className={`${solaceSans.variable} ${solaceDisplay.variable} bg-background font-sans antialiased`}
      >
        <Script
          id="calendar-bootstrap-date"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: calendarBootstrapScript }}
        />
        <GsapAnimationProvider />
        <RouteTransitionProvider>
          <MobileRuntimeBridge>
            <LoggerBootstrap />
            <QueryProvider>
              <ThemeProvider
                attribute="class"
                defaultTheme="system"
                enableSystem
                disableTransitionOnChange
              >
                <LoadingProvider>
                  <SettingsProvider>
                    <CalendarProvider>
                      <MobilePage>{children}</MobilePage>
                    </CalendarProvider>
                    <Toaster />
                  </SettingsProvider>
                </LoadingProvider>
              </ThemeProvider>
            </QueryProvider>
          </MobileRuntimeBridge>
        </RouteTransitionProvider>
      </body>
    </html>
  );
}
