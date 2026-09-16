import {
  buildEmailHtmlDocument,
  emailHasOwnDarkMode,
  processEmailHtml,
} from "@workspace/calendar-core/mail-html";

export function HtmlEmailRenderer({
  html,
  blockRemoteImages,
  blockTrackingPixels,
  isDark,
}: {
  html: string;
  blockRemoteImages: boolean;
  blockTrackingPixels: boolean;
  isDark: boolean;
}) {
  const srcDoc = buildEmailHtmlDocument({
    processedHtml: processEmailHtml({
      html,
      isDark,
      blockTrackingPixels,
      blockRemoteImages,
    }),
    blockRemoteImages,
    isDark,
    hasOwnDark: emailHasOwnDarkMode(html),
  });

  // No allow-same-origin: the frame fills its flex container and scrolls on its
  // own, so the parent never reaches into the document (no height measuring).
  // Scripts stay disabled; opened links escape the sandbox to behave normally.
  return (
    <iframe
      srcDoc={srcDoc}
      title="Email body"
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      className="flex-1 min-h-0 w-full border-0 block"
    />
  );
}
