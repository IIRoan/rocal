import Link from "next/link";
import Image from "next/image";
import { Logo, ThemeToggle } from "@workspace/ui/components/layout";
import { ArrowLeft } from "lucide-react";
import { CALENDAR_HOME_PATH } from "@/lib/app-routes";

export default function PrivacyPage() {
  return (
    <section className="min-h-[100dvh] flex">
      {/* Left side - Content */}
      <div className="relative flex w-full flex-col justify-center px-6 py-10 sm:px-12 lg:w-1/2 lg:px-16 xl:px-24">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-secondary/30 via-background to-background" />

        <div className="relative z-10 mx-auto w-full max-w-md">
          {/* Logo + Theme toggle */}
          <div className="mb-10 flex items-center justify-between">
            <Logo width={44} height={44} className="text-primary" aria-label="Solace" />
            <ThemeToggle />
          </div>

          {/* Heading */}
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Privacy</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              How Solace handles your data
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Solace is a passion project, not a business built on your data. We make a
              calendar and a private email client, both designed to help you manage your
              time and communication without ads, profiling, or data sales.
            </p>
          </div>

          {/* Content sections */}
          <div className="space-y-8 text-sm leading-7 text-muted-foreground">

            <div>
              <h2 className="text-base font-semibold text-foreground">What we make</h2>
              <p className="mt-2">
                <span className="font-medium text-foreground/80">Calendar</span>: schedule
                events, set reminders, share calendars, and organise by category. Event
                content is encrypted on your device before it leaves it, with the level
                of protection depending on whether the event has reminders enabled.
              </p>
              <p className="mt-2">
                <span className="font-medium text-foreground/80">Mail</span>: a private
                email client connected to your own mailbox on our server. Messages are
                encrypted at rest, meaning stored content is protected from server-level
                access. Because email is a legacy protocol, messages from external
                providers like Gmail arrive in plaintext first; this is unavoidable and
                explained in more detail below.
              </p>
            </div>

            <div id="calendar-encryption">
              <h2 className="text-base font-semibold text-foreground">
                Calendar: how encryption works
              </h2>
              <p className="mt-2">
                Calendar content is encrypted on your device using a key derived from
                your password. The server only ever receives ciphertext; it cannot read
                your event details. How much is encrypted depends on whether the event
                has a reminder set.
              </p>
              <p className="mt-3 font-medium text-foreground/80">Without reminders</p>
              <p className="mt-1">
                Everything is encrypted end-to-end. The server stores ciphertext for all
                fields and has no way to read any of the event content.
              </p>
              <p className="mt-3 font-medium text-foreground/80">With reminders</p>
              <p className="mt-1">
                To send you a reminder email at the right time with the right event
                details, the server needs to know when to send it and what to say. This
                means the event title, date, and time are stored in a form the server can
                read. Everything else (description, location, calendar name, category)
                stays encrypted.
              </p>
              <div className="mt-3 rounded-lg border border-border/50 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="px-3 py-2 text-left font-medium text-foreground/70">Field</th>
                      <th className="px-3 py-2 text-left font-medium text-foreground/70">No reminder</th>
                      <th className="px-3 py-2 text-left font-medium text-foreground/70">With reminder</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {[
                      { field: "Event title",       noReminder: "yes", withReminder: "no"  },
                      { field: "Event description", noReminder: "yes", withReminder: "yes" },
                      { field: "Event location",    noReminder: "yes", withReminder: "yes" },
                      { field: "Date & time",       noReminder: "yes", withReminder: "no"  },
                      { field: "Calendar name",     noReminder: "yes", withReminder: "yes" },
                      { field: "Category name",     noReminder: "yes", withReminder: "yes" },
                      { field: "Participants",      noReminder: "no",  withReminder: "no"  },
                      { field: "Account & login",   noReminder: "no",  withReminder: "no"  },
                    ].map(({ field, noReminder, withReminder }) => (
                      <tr key={field}>
                        <td className="px-3 py-2 text-foreground/80">{field}</td>
                        <td className="px-3 py-2">
                          {noReminder === "yes"
                            ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">Encrypted</span>
                            : <span className="text-muted-foreground/60">Plaintext</span>}
                        </td>
                        <td className="px-3 py-2">
                          {withReminder === "yes"
                            ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">Encrypted</span>
                            : <span className="text-amber-600 dark:text-amber-400 font-medium">Plaintext</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div id="mail-encryption">
              <h2 className="text-base font-semibold text-foreground">
                Mail: what encryption at rest covers
              </h2>
              <p className="mt-2">
                Your mailbox uses a key derived from your password to encrypt each
                message using OpenPGP before writing it to disk. This means stored
                message content is opaque to anyone with database or disk access, and
                the server cannot decrypt it without your key.
              </p>
              <p className="mt-3 font-medium text-foreground/80">The transit window</p>
              <p className="mt-1">
                Email is a decades-old protocol that was not designed with end-to-end
                encryption in mind. When someone sends you a message from Gmail, Outlook,
                or any other external provider, that message travels over SMTP and
                arrives at our server in plaintext. There is a brief window between
                arrival and encryption where the server can read the message content.
                We encrypt it as soon as it is received, but we want to be honest that
                this window exists. There is no way to eliminate it while supporting
                standard email from external senders.
              </p>
              <p className="mt-3 font-medium text-foreground/80">What stays readable</p>
              <p className="mt-1">
                Routing metadata (sender, recipients, headers) remains readable to the
                server even after the message is encrypted. This is necessary for
                delivery, display, and threading to work.
              </p>
              <div className="mt-3 rounded-lg border border-border/50 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="px-3 py-2 text-left font-medium text-foreground/70">Field</th>
                      <th className="px-3 py-2 text-left font-medium text-foreground/70">Protected</th>
                      <th className="px-3 py-2 text-left font-medium text-foreground/70 hidden sm:table-cell">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {[
                      { field: "Message body",              status: "yes",     note: "Encrypted in storage; readable at arrival from external senders" },
                      { field: "Attachments",               status: "yes",     note: "PGP/MIME wraps the full message including attachments" },
                      { field: "Subject",                   status: "partial", note: "Likely in stored blob; may remain in search indexes" },
                      { field: "From header",               status: "no",      note: "Needed for display; may stay in admin/index layer" },
                      { field: "To / Cc headers",           status: "no",      note: "Needed for delivery" },
                      { field: "Bcc header",                status: "partial", note: "Usually stripped by SMTP; envelope data may remain in logs" },
                      { field: "Date, Message-ID headers",  status: "no",      note: "Used for sorting and threading" },
                      { field: "Received headers",          status: "no",      note: "Routing metadata" },
                      { field: "Envelope sender / recipient", status: "no",    note: "SMTP transaction data; required for delivery" },
                      { field: "Admin ability to decrypt",  status: "no",      note: "Private keys are yours; server cannot decrypt stored messages" },
                    ].map(({ field, status, note }) => (
                      <tr key={field}>
                        <td className="px-3 py-2 text-foreground/80">{field}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {status === "yes"     && <span className="text-emerald-600 dark:text-emerald-400 font-medium">Yes</span>}
                          {status === "no"      && <span className="text-muted-foreground/60">No</span>}
                          {status === "partial" && <span className="text-amber-600 dark:text-amber-400 font-medium">Partial</span>}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground/70 hidden sm:table-cell">{note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">Your password is your key</h2>
              <p className="mt-2">
                Both calendar and mail encryption keys are derived from your password.
                That means if you lose your password, you lose access to your encrypted
                content; there is no recovery path, because we never hold the key
                ourselves. Keep your password somewhere safe.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">What we do not do</h2>
              <p className="mt-2">
                We do not use your data for advertising, resale, or profiling. Your
                calendar and email are not a product. The app uses your information only
                to show your schedule, deliver your reminders, and keep your mailbox
                working.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">Why this project exists</h2>
              <p className="mt-2">
                Solace exists because we wanted tools that respect the person using
                them. A calmer calendar. A private inbox. Built to be useful, not to
                extract value.
              </p>
            </div>

          </div>

          {/* Footer link */}
          <div className="mt-8">
            <Link
              href={CALENDAR_HOME_PATH}
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-4" />
              <span>Back to calendar</span>
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
            className="size-full object-cover"
            fill
            sizes="50vw"
            loading="eager"
            unoptimized
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
        </div>
      </div>
    </section>
  );
}
