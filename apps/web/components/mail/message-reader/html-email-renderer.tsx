import { useEffect, useEffectEvent, useState } from "react";
import {
  buildEmailHtmlDocument,
  processEmailHtml,
} from "@workspace/calendar-core/mail-html";
import { usePrefersReducedMotion } from "@workspace/ui/hooks";
import { cn } from "@workspace/ui/lib/utils";
import {
  createMailLinkRewriter,
  registerMailLinks,
} from "@/lib/mail/mail-link-handoff";
import { fadeInMailReaderContent } from "../mail-app/mail-reader-transition";
import { mailBodySurfaceClassName } from "./constants";

export function HtmlEmailRenderer({
  html,
  blockRemoteImages,
  blockTrackingPixels,
  confirmExternalLinks,
  isDark,
}: {
  html: string;
  blockRemoteImages: boolean;
  blockTrackingPixels: boolean;
  confirmExternalLinks: boolean;
  isDark: boolean;
}) {
  const [hasLoaded, setHasLoaded] = useState(false);
  const [linkScope, setLinkScope] = useState(() => ({ html, confirmExternalLinks, token: crypto.randomUUID() }));
  // A new link set gets new ids, so a link page still resolving an old id never receives a different link.
  if (linkScope.html !== html || linkScope.confirmExternalLinks !== confirmExternalLinks) {
    setLinkScope({ html, confirmExternalLinks, token: crypto.randomUUID() });
  }
  const prefersReducedMotion = usePrefersReducedMotion();
  const { links, rewriteLink } = createMailLinkRewriter(linkScope.token, confirmExternalLinks);
  const srcDoc = buildEmailHtmlDocument({
    processedHtml: processEmailHtml({
      html,
      isDark,
      blockTrackingPixels,
      blockRemoteImages,
      rewriteLink,
    }),
    blockRemoteImages,
    isDark,
  });

  const registerLinks = useEffectEvent(() => registerMailLinks(links));
  useEffect(() => registerLinks(), [linkScope.token]);

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
