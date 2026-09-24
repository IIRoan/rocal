import { useState } from "react";
import {
  buildEmailHtmlDocument,
  emailHasOwnDarkMode,
  processEmailHtml,
} from "@workspace/calendar-core/mail-html";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";
import { cn } from "@workspace/ui/lib/utils";
import { fadeInMailReaderContent } from "../mail-app/mail-reader-transition";
import { mailBodySurfaceClassName } from "./constants";

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
  const [hasLoaded, setHasLoaded] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
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

  // The frame paints nothing until its document loads, so it stays hidden over a matching surface and fades in once.
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", mailBodySurfaceClassName(isDark))}>
      {/* No allow-same-origin: the parent never reads the frame document, so mail HTML stays isolated. */}
      <iframe
        srcDoc={srcDoc}
        title="Email body"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        onLoad={(event) => {
          if (hasLoaded) return;
          setHasLoaded(true);
          fadeInMailReaderContent(event.currentTarget, prefersReducedMotion);
        }}
        className={cn("block min-h-0 w-full flex-1 border-0", !hasLoaded && "opacity-0")}
      />
    </div>
  );
}
