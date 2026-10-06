import Link from "@tiptap/extension-link";

/** Link mark storing href exactly as typed: no autolink, normalization, or protocol resolution, so relative hrefs survive round-trips. */
export const LiteralLink = Link.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      autolink: false,
      linkOnPaste: false,
      defaultProtocol: null,
      protocols: [],
      isAllowedUri: () => true,
      shouldAutoLink: () => false,
      openOnClick: false,
      HTMLAttributes: { rel: "noopener noreferrer nofollow" },
    };
  },

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
});
