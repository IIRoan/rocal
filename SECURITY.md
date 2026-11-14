# Security policy

## Reporting a vulnerability

Email **support@solace.onl** with "Security" in the subject. Never open a public issue for a vulnerability; the issue tracker is public.

Please include:

- the affected component (web app, API, mail server, iOS app, or a file in this repository);
- the steps to reproduce it;
- the impact you expect;
- whether you accessed, or could access, anyone else's data.

## Scope

- The web app at `solace.onl`, the API at `api.solace.onl`, public JMAP at `mail.solace.onl`, and SMTP and the outbound relay at `mx.solace.onl`.
- The Solace Calendar and Solace Mail iOS apps.
- The code in this repository, including flaws in the end-to-end encryption design. Any way for the server to learn user content is in scope.

## Out of scope

- Volumetric denial of service and load testing.
- Social engineering and physical attacks.
- Findings that need a rooted or jailbroken device or a compromised operating system.
- Missing headers or best practices without a demonstrated impact.
- SPF or DMARC on domains that send no mail.
- Self-XSS.
- Reports that only repeat the known gaps and accepted trade-offs documented in `AGENTS.md` §2, such as the plaintext `EventParticipant` email and name and the listed "Known gaps".
- Third-party services (Railway, Vercel, Expo, Apple).
- The untracked `webmail/` reference.

## What to expect

- An acknowledgement within 5 business days.
- An assessment within 14 days.
- A fix for critical issues within 30 days.
- Coordinated disclosure once a fix ships, or after 90 days.
- Credit on request. There is no bug bounty.

## Safe harbour

Good-faith research under this policy is authorized, and we will not pursue it legally, provided you:

- use only accounts you own or have permission to test;
- stop and report as soon as you reach anyone else's data, without keeping, sharing or changing it;
- avoid degrading the service for others;
- give us reasonable time to fix the issue before you disclose it.
