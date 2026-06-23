import Link from "@tiptap/extension-link";

/**
 * Link mark that stores href exactly as typed — no autolink, no defaultProtocol,
 * no URL normalization. Uses getAttribute("href") when parsing DOM so relative
 * paths are not resolved against the page origin.
 */
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
