import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#14110f] px-4 py-12 text-[#f5f0e8]">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
        <header>
          <p className="text-xs uppercase tracking-[0.18em] text-[#a49a8f]">
            Privacy
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            How Solace handles your data
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-[#c8beb2] sm:text-base">
            Solace is a passion project with a non-profit motive. The goal is to
            help people manage time with less friction, not to build ad profiles,
            sell data, or turn your calendar into a product.
          </p>
        </header>

        <section className="space-y-8 text-sm leading-7 text-[#ddd5ca] sm:text-base">
          <div>
            <h2 className="text-lg font-semibold text-[#f5f0e8]">
              What we store
            </h2>
            <p className="mt-2">
              The database keeps the pieces needed to run the app: your user
              profile, email address, login sessions, calendars, events,
              categories, collaborators, reminder rules, settings, and reminder
              delivery records.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-[#f5f0e8]">
              What that looks like in practice
            </h2>
            <p className="mt-2">
              For a calendar to work, Solace needs event titles, dates, times,
              locations, descriptions, calendar membership, and notification
              preferences. If you sign in with a passkey or another provider, the
              app also stores the account identifiers needed to keep that login
              working. If you connect shared or external calendars, it stores the
              subscription and sync metadata needed to keep those calendars up to
              date.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-[#f5f0e8]">
              What we do not do
            </h2>
            <p className="mt-2">
              We do not use your data for advertising, resale, profiling, or
              unrelated marketing. We do not treat your calendar as a source of
              monetization. The app uses the information only to show your
              schedule, send the reminders you asked for, and keep your account
              working.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-[#f5f0e8]">
              Why this project exists
            </h2>
            <p className="mt-2">
              Solace was built as a passion project because we wanted a calmer,
              more intentional calendar experience. It is not designed around
              extracting value from personal data. It is designed around being
              useful, respectful, and simple.
            </p>
          </div>
        </section>

        <footer className="pt-2 text-sm text-[#a49a8f]">
          <Link
            href="/dashboard"
            className="inline-flex uppercase tracking-[0.16em] hover:text-[#f5f0e8]"
          >
            Back to dashboard
          </Link>
        </footer>
      </div>
    </main>
  );
}
