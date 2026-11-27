import Link from "@tiptap/extension-link";
import { isSafeEmailUrl } from "@workspace/calendar-core/sanitize-email-html";

/** Link mark storing href exactly as typed: no autolink, normalization, or protocol resolution, so relative hrefs survive round-trips. */
export const LiteralLink = Link.extend({
  addProseMirrorPlugins() {
    return [];
  },
}).configure({
  autolink: false,
  linkOnPaste: false,
  defaultProtocol: "",
  protocols: [],
  // renderHTML passes no href for a link mark without one.
  isAllowedUri: (url) => isSafeEmailUrl("a", "href", url ?? ""),
  // The parent's paste rule still runs and links bare URLs in pasted text unless this refuses them.
  shouldAutoLink: () => false,
  openOnClick: false,
  // Configure merges into TipTap's defaults, so its `target="_blank"` is cleared to keep links as written.
  HTMLAttributes: { target: null, rel: "noopener noreferrer nofollow" },
});
