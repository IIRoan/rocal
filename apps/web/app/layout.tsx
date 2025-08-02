import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@workspace/ui/components/ui";
import { ThemeProvider } from "@workspace/ui/providers";
import { CalendarProvider } from "@workspace/ui/components/calendar";
import { SettingsProvider } from "@/components/settings-provider";
import "@workspace/ui/globals.css";

const fontSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const fontMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

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
