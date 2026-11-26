import Link from "@tiptap/extension-link";
import { isSafeEmailUrl } from "@workspace/calendar-core/sanitize-email-html";

/** Link mark storing href exactly as typed: no autolink, normalization, or protocol resolution, so relative hrefs survive round-trips. */
export const LiteralLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      href: {
        default: null,
        parseHTML: (element) => element.getAttribute("href"),
        renderHTML: (attributes) => {
          if (!attributes.href) {
            return {};
          }
          return { href: attributes.href };
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [];
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setLink:
        (attributes) =>
        ({ chain }) =>
          chain()
            .setMark(this.name, {
              href: attributes.href,
              target: attributes.target ?? null,
            })
            .run(),
    };
  },
}).configure({
  autolink: false,
  linkOnPaste: false,
  defaultProtocol: "",
  protocols: [],
  // renderHTML passes no href for a link mark without one.
  isAllowedUri: (url) => isSafeEmailUrl("a", "href", url ?? ""),
  shouldAutoLink: () => false,
  openOnClick: false,
  // Configure merges into TipTap's defaults, so its `target="_blank"` is cleared to keep links as written.
  HTMLAttributes: { target: null, rel: "noopener noreferrer nofollow" },
});
