import Link from "next/link";
import Image from "next/image";
import { Logo, ThemeToggle } from "@workspace/ui/components/layout";
import { ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
  return (
    <section className="min-h-[100dvh] flex">
      {/* Left side - Content */}
      <div className="relative flex w-full flex-col justify-center px-6 py-10 sm:px-12 lg:w-1/2 lg:px-16 xl:px-24">
        {/* Subtle gradient background */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-secondary/30 via-background to-background" />

        <div className="relative z-10 mx-auto w-full max-w-md">
          {/* Logo + Theme toggle */}
          <div className="mb-10 flex items-center justify-between">
            <Logo
              width={44}
              height={44}
              className="text-primary"
              aria-label="Solace"
            />
            <ThemeToggle />
          </div>

          {/* Heading */}
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Privacy
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              How Solace handles your data
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Solace is a passion project with a non-profit motive. The goal is
              to help people manage time with less friction, not to build ad
              profiles, sell data, or turn your calendar into a product.
            </p>
          </div>

          {/* Content sections */}
          <div className="space-y-6 text-sm leading-7 text-muted-foreground">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                What we store
              </h2>
              <p className="mt-2">
                The database keeps the pieces needed to run the app: your user
                profile, email address, login sessions, calendars, events,
                categories, collaborators, reminder rules, settings, and
                reminder delivery records.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">
                What that looks like in practice
              </h2>
              <p className="mt-2">
                For a calendar to work, Solace needs event titles, dates, times,
                locations, descriptions, calendar membership, and notification
                preferences. If you sign in with a passkey or another provider,
                the app also stores the account identifiers needed to keep that
                login working. If you connect shared or external calendars, it
                stores the subscription and sync metadata needed to keep those
                calendars up to date.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">
                What we do not do
              </h2>
              <p className="mt-2">
                We do not use your data for advertising, resale, profiling, or
                unrelated marketing. We do not treat your calendar as a source
                of monetization. The app uses the information only to show your
                schedule, send the reminders you asked for, and keep your
                account working.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">
                Why this project exists
              </h2>
              <p className="mt-2">
                Solace was built as a passion project because we wanted a
                calmer, more intentional calendar experience. It is not designed
                around extracting value from personal data. It is designed
                around being useful, respectful, and simple.
              </p>
            </div>
          </div>

          {/* Footer link */}
          <div className="mt-8">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to dashboard</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Right side - Wallpaper (hidden on mobile) */}
      <div className="hidden lg:block lg:w-1/2 relative">
        <div className="absolute inset-4 rounded-2xl overflow-hidden shadow-2xl">
          <Image
            src="/wallpaper.jpg"
            alt="Solace — collaborate better"
            className="h-full w-full object-cover"
            fill
            unoptimized
          />
          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
        </div>
      </div>
    </section>
  );
}
