import type { Metadata } from "next";
import Link from "next/link";
import {
  PRODUCT_ISSUES_URL,
  PRODUCT_ROUTES,
  supportContactUrl,
} from "@workspace/calendar-core/product-info";
import { PublicInformationPage } from "@/components/public-information-page";

export const metadata: Metadata = {
  title: "Support · Solace",
  description:
    "Help with Solace Calendar and Solace Mail, account access, encryption and privacy.",
};

const answers = [
  {
    question: "How do I create an account?",
    answer:
      "Solace currently requires an invitation. Ask someone who already uses Solace for an invite. If your invitation expired, ask them for a new one. Calendar and Mail use the same account; accepting the invite also enables mailbox setup.",
  },
  {
    question: "Do I need both apps?",
    answer:
      "Each app works on its own. Solace Calendar manages events and reminders. Solace Mail manages your inbox and opens calendar events in Solace Calendar when it is installed. You can also use your account on the web.",
  },
  {
    question: "What if I forget my password?",
    answer:
      "Your password signs you in and opens your encrypted data on every device. Solace does not reset passwords from the sign-in screen, so email support from a different address. Without your password, no one, including Solace, can open your encrypted content.",
  },
  {
    question: "How do I change notification permissions?",
    answer:
      "Change reminder preferences in Notifications in the account drawer. On iPhone, also check the app’s notification permissions in system Settings. Calendar reminders belong to Calendar; new-mail alerts belong to Mail. Both apps remain usable when notifications are denied.",
  },
  {
    question: "How do I delete my account?",
    answer:
      "In either app, open the account drawer, choose Account, then Delete account. On the web, open the command palette and choose Account. Confirm the deletion. This removes the account, its calendars, mailbox and profile picture. Messages already delivered to others and addresses kept by other event organizers remain with them.",
  },
];

export default function SupportPage() {
  const contact = supportContactUrl();
  return (
    <PublicInformationPage
      eyebrow="Support"
      title="Help with Calendar and Mail"
      description="Find help with your Solace account, calendars, inbox and encrypted data. You can read this page without signing in."
      currentPath={PRODUCT_ROUTES.support}
    >
      <section aria-labelledby="support-questions">
        <h2
          id="support-questions"
          className="text-base font-semibold text-foreground"
        >
          Common questions
        </h2>
        <dl className="mt-4 space-y-6">
          {answers.map(({ question, answer }) => (
            <div key={question}>
              <dt className="font-medium text-foreground">{question}</dt>
              <dd className="mt-2">{answer}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-labelledby="support-contact">
        <h2
          id="support-contact"
          className="text-base font-semibold text-foreground"
        >
          Get help
        </h2>
        {contact ? (
          <p className="mt-2">
            <a
              href={contact}
              className="text-primary underline underline-offset-4 cursor-pointer"
            >
              Contact support privately
            </a>{" "}
            for account or privacy requests. Describe what happened and which
            app you use.
          </p>
        ) : null}
        <p className="mt-3">
          You can{" "}
          <a
            href={PRODUCT_ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-4 cursor-pointer"
          >
            report a bug or request a feature
          </a>{" "}
          on GitHub. Reports are public: never include passwords, recovery keys,
          session tokens, message content or private event details.
        </p>
        <p className="mt-3">
          Read the{" "}
          <Link
            href={PRODUCT_ROUTES.privacy}
            className="text-primary underline underline-offset-4 cursor-pointer"
          >
            privacy policy
          </Link>{" "}
          for information about encryption, providers, retention and account
          deletion.
        </p>
      </section>
    </PublicInformationPage>
  );
}
