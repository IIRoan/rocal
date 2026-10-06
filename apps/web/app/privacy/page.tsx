import Link from "next/link";
import Image from "next/image";
import { Logo, ThemeToggle } from "@workspace/ui/components/layout";
import { ArrowLeft } from "lucide-react";
import {
  EVENT_ENCRYPTED_FIELDS,
  EVENT_READABLE_METADATA,
  EVENT_INVITATION_ENCRYPTION_HINT,
  CALENDAR_ICS_SHARING_HINT,
  MAIL_READABLE_METADATA,
} from "@workspace/calendar-core";
import { CALENDAR_HOME_PATH } from "@/lib/app-routes";

export default function PrivacyPage() {
  return (
    <section className="min-h-[100dvh] flex">
      {/* Left side - Content */}
      <div className="relative flex w-full flex-col justify-center px-6 py-10 sm:px-12 lg:w-1/2 lg:px-16 xl:px-24">
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
              Solace is a passion project, not a business built on your data. It
              includes a calendar and a private email client, both designed to
              help you manage your time and communication without ads,
              profiling, or data sales.
            </p>
          </div>

          <div className="flex flex-col gap-8 text-sm leading-7 text-muted-foreground">
            <div id="calendar-encryption">
              <h2 className="text-base font-semibold text-foreground">
                Calendar encryption
              </h2>
              <p className="mt-2">
                Solace encrypts event titles, descriptions and locations on your
                device before saving them. Enabling reminders does not make
                these fields readable to the server.
              </p>
              <div className="mt-3 overflow-hidden rounded-lg border border-border/50">
                <table className="w-full text-xs">
                  <caption className="sr-only">
                    Encrypted event content and readable metadata
                  </caption>
                  <tbody className="divide-y divide-border/30">
                    <tr>
                      <th
                        scope="row"
                        className="px-3 py-2 text-left font-medium text-foreground"
                      >
                        End-to-end encrypted
                      </th>
                      <td className="px-3 py-2">
                        {EVENT_ENCRYPTED_FIELDS.join(", ")}
                      </td>
                    </tr>
                    <tr>
                      <th
                        scope="row"
                        className="px-3 py-2 text-left font-medium text-foreground"
                      >
                        Server can read
                      </th>
                      <td className="px-3 py-2">
                        {EVENT_READABLE_METADATA.join("; ")}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3">
                Owned calendar and category names are encrypted separately.
                Colors, settings, ownership and sharing information remain
                readable. Legacy names and events may remain readable until a
                signed-in device finishes migrating them.
              </p>
              <p className="mt-3">
                Reminder emails contain a generic notice; Solace resolves event
                details on your device when you open the message. iPhone alerts
                can show a title decrypted on the device when its keys are
                available.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">
                Invitations, subscriptions and sharing
              </h2>
              <p className="mt-2">
                {EVENT_INVITATION_ENCRYPTION_HINT} Invitation content is handled
                by the server to send the email, even when your saved event is
                encrypted. Participant names, email addresses and RSVP status
                remain readable.
              </p>
              <p className="mt-3">
                Imported invitations can be read by the server before your
                device encrypts the calendar copy. The original email is
                separate. Subscribed and public calendars are fetched by the
                server, so their feed names, URLs and event details are
                readable.
              </p>
              <p className="mt-3">{CALENDAR_ICS_SHARING_HINT}</p>
            </div>

            <div id="mail-encryption">
              <h2 className="text-base font-semibold text-foreground">
                Mail encryption
              </h2>
              <p className="mt-2">
                Mailbox storage encryption protects incoming message content
                after the mail server receives it. Ordinary incoming mail is
                readable to the server before encryption. Transport encryption
                between mail servers is separate from end-to-end encryption.
              </p>
              <p className="mt-3">{MAIL_READABLE_METADATA}</p>
              <p className="mt-3">
                Storage encryption is an account setting, not proof that every
                message is encrypted. Older mail, drafts and sent copies may be
                readable. Solace disables automatic storage encryption for
                messages appended by the client.
              </p>
              <p className="mt-3">
                When a sender encrypts with your OpenPGP public key before
                sending, the content inside that payload is end-to-end
                encrypted. Attachments outside the payload are not covered.
                Detecting a PGP payload alone does not prove it was encrypted
                before delivery. Signature verification is a separate check.
              </p>
              <p className="mt-3">
                New mail vaults use a random secret sealed to your account
                encryption key. The server stores encrypted vault backups.
                Legacy vaults without that seal may use a server-derived secret
                and need migration. The backend can still authenticate to the
                mailbox, and invitation processing
                reads readable mail content when available.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">
                Protecting your keys
              </h2>
              <p className="mt-2">
                Your password protects your encryption keys; it is not the mail
                vault secret. Email sign-in uses your email password. Passkey
                and social sign-in use a separate encryption password. Changing
                that password rewraps your existing keys rather than
                re-encrypting your content.
              </p>
              <p className="mt-3">
                Keep your encryption password safe. A login reset alone cannot
                recover encrypted content. An already unlocked device may let
                you set a new encryption password while preserving your keys.
              </p>
            </div>

            <div>
              <h2 className="text-base font-semibold text-foreground">
                Other data
              </h2>
              <p className="mt-2">
                Contacts and mail settings are encrypted on your device before
                syncing. Account details needed for sign-in and delivery, and
                uploaded profile pictures, are not end-to-end encrypted.
              </p>
              <p className="mt-3">
                Solace does not use your data for advertising, resale or
                profiling. There are no third-party analytics or session replay
                tools. Error reports go to Solace&apos;s own error tracker with
                sensitive fields scrubbed.
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
            alt="Solace, collaborate better"
            className="size-full object-cover"
            fill
            sizes="50vw"
            loading="eager"
            unoptimized
          />
          {/* repo-rules-allow theme-tokens-only: photo scrim over the wallpaper image for depth, not a styled UI surface. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
        </div>
      </div>
    </section>
  );
}
