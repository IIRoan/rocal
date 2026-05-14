import { Resend } from "resend";
import type { AuthEmailClient } from "./auth-email";

export const resend: AuthEmailClient | null = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export const authEmailFrom =
  process.env.AUTH_EMAIL_FROM ||
  process.env.AUTH_RESET_EMAIL_FROM ||
  "Solace <notifications@mailing.roan.dev>";
