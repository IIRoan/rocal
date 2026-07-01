import { useMemo } from "react";
import {
  buildEmailHtmlDocument,
  emailHasOwnDarkMode,
  processEmailHtml,
} from "@workspace/calendar-core";

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
  const processedHtml = useMemo(() => {
    return processEmailHtml({ html, isDark, blockTrackingPixels });
  }, [html, isDark, blockTrackingPixels]);

  const hasOwnDark = useMemo(() => emailHasOwnDarkMode(html), [html]);

  const srcDoc = useMemo(() => {
    return buildEmailHtmlDocument({
      processedHtml,
      blockRemoteImages,
      isDark,
      hasOwnDark,
    });
  }, [processedHtml, blockRemoteImages, isDark, hasOwnDark]);

  return (
    <iframe
      srcDoc={srcDoc}
      title="Email body"
      sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
      className="flex-1 min-h-0 w-full border-0 block"
    />
  );
}
