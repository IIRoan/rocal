"use client";

import { useEffect } from "react";
import { buildMailOAuthCallbackMessage } from "@/lib/mail/oauth-client";

export default function MailOAuthCallbackPage() {
  useEffect(() => {
    const message = buildMailOAuthCallbackMessage(window.location.search);

    if (window.opener) {
      window.opener.postMessage(message, window.location.origin);
    }

    if (window.parent && window.parent !== window) {
      window.parent.postMessage(message, window.location.origin);
    }
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Completing mail sign-in...
    </main>
  );
}
