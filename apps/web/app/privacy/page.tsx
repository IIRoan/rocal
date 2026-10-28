import type { Metadata } from "next";
import Link from "next/link";
import { PublicInformationPage } from "@/components/public-information-page";
import {
  PRODUCT_ROUTES,
  supportContactUrl,
} from "@workspace/calendar-core/product-info";
import {
  EVENT_ENCRYPTED_FIELDS,
  EVENT_READABLE_METADATA,
  EVENT_INVITATION_ENCRYPTION_HINT,
  CALENDAR_ICS_SHARING_HINT,
  MAIL_READABLE_METADATA,
} from "@workspace/calendar-core";

export const metadata: Metadata = {
  title: "Privacy · Solace",
  description:
    "How Solace Calendar and Mail handle encryption, personal data, providers, retention and account deletion.",
};

export default function PrivacyPage() {
  const contact = supportContactUrl();
  return (
    <PublicInformationPage
      eyebrow="Privacy"
      title="How Solace handles your data"
      description="Solace Calendar and Solace Mail help you manage your time and communication without advertising, profiling or data sales. This page explains the data the service handles and the limits of its encryption."
      currentPath={PRODUCT_ROUTES.privacy}
    >
      <div className="flex flex-col gap-8 text-sm leading-7 text-muted-foreground">
        <PrivacyOverview />
        <PrivacyDataUse />

        <div id="calendar-encryption">
          <h2 className="text-base font-semibold text-foreground">
            Calendar encryption
          </h2>
          <p className="mt-2">
            Solace encrypts event titles, descriptions and locations on your
            device before saving them. Enabling reminders does not make these
            fields readable to the server.
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
            Owned calendar and category names are encrypted separately. Colors,
            settings, ownership and sharing information remain readable. Legacy
            names and events may remain readable until a signed-in device
            finishes migrating them.
          </p>
          <p className="mt-3">
            Reminder emails contain a generic notice; Solace resolves event
            details on your device when you open the message. iPhone alerts can
            show a title decrypted on the device when its keys are available.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-foreground">
            Invitations, subscriptions and sharing
          </h2>
          <p className="mt-2">
            {EVENT_INVITATION_ENCRYPTION_HINT} Invitation content is handled by
            the server to send the email, even when your saved event is
            encrypted. Participant names, email addresses and RSVP status remain
            readable.
          </p>
          <p className="mt-3">
            Imported invitations can be read by the server before your device
            encrypts the calendar copy. The original email is separate.
            Subscribed and public calendars are fetched by the server, so their
            feed names, URLs and event details are readable.
          </p>
          <p className="mt-3">{CALENDAR_ICS_SHARING_HINT}</p>
        </div>

        <div id="mail-encryption">
          <h2 className="text-base font-semibold text-foreground">
            Mail encryption
          </h2>
          <p className="mt-2">
            Mailbox storage encryption protects incoming message content after
            the mail server receives it. Ordinary incoming mail is readable to
            the server before encryption. Transport encryption between mail
            servers is separate from end-to-end encryption.
          </p>
          <p className="mt-3">{MAIL_READABLE_METADATA}</p>
          <p className="mt-3">
            Storage encryption is an account setting, not proof that every
            message is encrypted. Older mail, drafts and sent copies may be
            readable. Solace disables automatic storage encryption for messages
            appended by the client.
          </p>
          <p className="mt-3">
            When a sender encrypts with your OpenPGP public key before sending,
            the content inside that payload is end-to-end encrypted. Attachments
            outside the payload are not covered. Detecting a PGP payload alone
            does not prove it was encrypted before delivery. Signature
            verification is a separate check.
          </p>
          <p className="mt-3">
            New mail vaults use a random secret sealed to your account
            encryption key. The server stores encrypted vault backups. Legacy
            vaults without that seal may use a server-derived secret and need
            migration. The backend can still authenticate to the mailbox, and
            invitation processing reads readable mail content when available.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-foreground">
            Protecting your keys
          </h2>
          <p className="mt-2">
            Your password protects your encryption keys; it is not the mail
            vault secret. Email sign-in uses your email password. Passkey and
            social sign-in use a separate encryption password. Changing that
            password rewraps your existing keys rather than re-encrypting your
            content. Passwords are stored only as salted hashes, and connections
            to Solace use TLS.
          </p>
          <p className="mt-3">
            Keep your encryption password safe. A login reset alone cannot
            recover encrypted content. An already unlocked device may let you
            set a new encryption password while preserving your keys.
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
            Solace does not use your data for advertising, resale or profiling.
            There are no analytics, session replay, advertising or
            error-reporting tools, and the apps send no crash reports.
          </p>
        </div>

        <section id="providers" aria-labelledby="privacy-providers">
          <h2
            id="privacy-providers"
            className="text-base font-semibold text-foreground"
          >
            Providers and delivery
          </h2>
          <p className="mt-2">
            Vercel serves the web app. Railway hosts the API, databases, mail
            service, notification worker and stored profile pictures. A
            separately hosted relay server sends and receives internet mail.
            Expo provides native app builds and over-the-air software updates.
            Apple delivers iPhone notifications through APNs. These providers
            process the information needed to host or deliver the service,
            including connection metadata.
          </p>
          <p className="mt-3">
            Providers process data only on Solace&apos;s behalf under their data
            processing terms and must protect it at least as well as this policy
            describes. Some are based in or process data in the United States;
            those transfers rely on the safeguards in their terms, such as
            Standard Contractual Clauses or the EU–U.S. Data Privacy Framework.
            Solace does not sell personal data or share it for advertising.
          </p>
          <p className="mt-3">
            Notification payloads use opaque event or message references;
            reminder titles and mail previews are resolved on your device when
            possible. Solace apps do not send crash or error reports, and
            there is no analytics or tracking. Hosting and delivery providers may
            process IP addresses for routing and security; Solace sessions do
            not store IP addresses or user agents.
          </p>
          <p className="mt-3">
            Sending email, accepting invitations, sharing calendars or
            subscribing to external feeds also communicates with the recipients,
            organizers or feed providers you choose.
          </p>
        </section>
        <section id="retention" aria-labelledby="privacy-retention">
          <h2
            id="privacy-retention"
            className="text-base font-semibold text-foreground"
          >
            Retention and deletion
          </h2>
          <p className="mt-2">
            Account information, calendars, contacts, settings and mailbox data
            are kept while you use the service, until you remove the relevant
            data or delete your account. Replacing or removing a profile picture
            deletes the previous stored picture.
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              App sessions last 14 days and renew during use. Expired sessions,
              verification values and OAuth tokens are eligible for cleanup one
              day after expiry.
            </li>
            <li>
              Sent notification jobs are kept for seven days. Notification
              delivery logs and failed or abandoned jobs are eligible for
              cleanup after 30 days.
            </li>
            <li>
              Expired, revoked and abandoned invitation claims are eligible for
              cleanup after 30 days. Accepted invitations remain part of
              invitation history until removed with the account.
            </li>
            <li>
              Push device registrations are eligible for cleanup after 180 days
              without activity. Active apps renew their registration.
            </li>
          </ul>
          <p className="mt-3">
            Cleanup runs hourly in bounded batches, so these windows describe
            when records become eligible for removal, rather than an exact
            deletion time. Infrastructure backups and provider operational
            records can outlast deletion from the live service; removing live
            data does not erase independent copies already held by a recipient.
          </p>
          <p className="mt-3">
            To delete your account, open the account drawer in either app,
            choose Account, then Delete account. On the web, open the command
            palette and choose Account. After the security check, Solace removes
            the mailbox, profile pictures and account-owned application records.
            Other organizers may retain participant addresses, and recipients
            retain messages already delivered to them.
          </p>
        </section>
        <section id="device-data" aria-labelledby="privacy-device-data">
          <h2
            id="privacy-device-data"
            className="text-base font-semibold text-foreground"
          >
            Your device and permissions
          </h2>
          <p className="mt-2">
            The native apps keep authentication and encryption material in
            secure storage. Mail’s offline snapshot is encrypted with a key
            bound to that device. Signing out clears app sessions, encryption
            keys and saved app caches. An optional on-device search index is
            encrypted; Solace does not persist its query cache as a separate
            unencrypted store.
          </p>
          <p className="mt-3">
            Notifications are optional and can be changed in app preferences or
            system Settings. Photo access is used only when you choose a profile
            picture; the selected image is re-encoded before upload to remove
            embedded metadata. These features do not require camera or
            microphone access.
          </p>
        </section>
        <PrivacyRights contact={contact} />
      </div>
    </PublicInformationPage>
  );
}

const DATA_USES: ReadonlyArray<readonly [string, string, string]> = [
  [
    "Account: email address, display name, password hash, passkeys, wrapped encryption keys and invitation",
    "Create your account, sign you in and protect your encrypted data",
    "Our agreement with you",
  ],
  [
    "Calendars: encrypted event content, times, recurrence, sharing, participants and subscribed feeds",
    "Show, sync and share your calendars and send the reminders you set",
    "Our agreement with you",
  ],
  [
    "Mail: messages, attachments, addresses, labels and mailbox settings",
    "Send, receive, store and search your mail",
    "Our agreement with you",
  ],
  [
    "Contacts and settings, encrypted on your device",
    "Keep your contacts and preferences in sync",
    "Our agreement with you",
  ],
  [
    "Profile picture, if you add one",
    "Show your picture in Solace to you and the people you correspond with",
    "Our agreement with you",
  ],
  [
    "Push notification token",
    "Deliver the reminders and new-mail alerts you turn on",
    "Your consent, which you can withdraw in Settings",
  ],
  [
    "Keyed hash of your IP address and request IDs",
    "Limit repeated sign-in attempts and keep the service secure",
    "Legitimate interest in security",
  ],
  [
    "Messages you send to support",
    "Answer your request",
    "Legitimate interest in helping you",
  ],
];

function PrivacyOverview() {
  return (
    <section id="overview" aria-labelledby="privacy-overview">
      <h2
        id="privacy-overview"
        className="text-base font-semibold text-foreground"
      >
        Overview
      </h2>
      <p className="mt-2">Last updated 28 October 2026.</p>
      <p className="mt-3">
        This policy covers the Solace website and the Solace Calendar and
        Solace Mail apps. Solace is free to use and has no in-app purchases,
        subscriptions or advertising. The apps require an existing Solace
        account; accounts are created by invitation.
      </p>
    </section>
  );
}

function PrivacyDataUse() {
  return (
    <section id="data-use" aria-labelledby="privacy-data-use">
      <h2
        id="privacy-data-use"
        className="text-base font-semibold text-foreground"
      >
        What Solace processes and why
      </h2>
      <p className="mt-2">
        Solace processes only what it needs to run your account, calendar
        and mailbox. You provide most of it; incoming mail, invitations and
        shared calendars come from the people and services you communicate
        with.
      </p>
      <div className="mt-3 overflow-x-auto rounded-lg border border-border/50">
        <table className="w-full text-xs">
          <caption className="sr-only">
            Personal data, purposes and legal bases
          </caption>
          <thead>
            <tr className="text-left text-foreground">
              <th scope="col" className="px-3 py-2 font-medium">
                Data
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Purpose
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Legal basis
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {DATA_USES.map(([data, purpose, basis]) => (
              <tr key={data}>
                <th
                  scope="row"
                  className="px-3 py-2 text-left font-medium text-foreground"
                >
                  {data}
                </th>
                <td className="px-3 py-2">{purpose}</td>
                <td className="px-3 py-2">{basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3">
        Solace does not make automated decisions about you that have legal
        or similarly significant effects. The website uses only cookies
        needed for sign-in and security, with no tracking or advertising
        cookies; the apps keep their session in the device&apos;s secure
        storage.
      </p>
    </section>
  );
}

function PrivacyRights({ contact }: { contact: string | null }) {
  return (
    <section id="contact" aria-labelledby="privacy-contact">
      <h2
        id="privacy-contact"
        className="text-base font-semibold text-foreground"
      >
        Your rights and privacy requests
      </h2>
      <p className="mt-2">
        You can access, correct, export or delete your personal data, restrict
        or object to its processing, and withdraw consent at any time. The apps
        let you edit your profile and settings, turn off notifications and
        delete your account. For anything else,{" "}
        {contact ? (
          <a
            href={contact}
            className="text-primary underline underline-offset-4 cursor-pointer"
          >
            contact Solace privately
          </a>
        ) : (
          "contact Solace through the support page"
        )}
        ; Solace answers within one month. Never send a password, encryption key
        or session token.
      </p>
      <p className="mt-3">
        If you believe your data is mishandled, you can also complain to the
        data protection authority where you live or work.
      </p>
      <p className="mt-3">
        Solace is not intended for children under 16, and accounts are created
        only by invitation.
      </p>
      <p className="mt-3">
        When this policy changes, the date at the top changes. Solace tells you
        in the apps or by email before significant changes apply.
      </p>
      <p className="mt-3">
        The{" "}
        <Link
          href={PRODUCT_ROUTES.support}
          className="text-primary underline underline-offset-4 cursor-pointer"
        >
          support page
        </Link>{" "}
        explains account recovery, notification permissions and account
        deletion. Public bug reports should contain no private account, mail or
        calendar content.
      </p>
    </section>
  );
}
