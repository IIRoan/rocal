import type { AnyExtension } from "@tiptap/core";
import Paragraph from "@tiptap/extension-paragraph";
import Heading from "@tiptap/extension-heading";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import StarterKit from "@tiptap/starter-kit";
import { LiteralLink } from "./literal-link";
import { MailImage } from "./mail-image";
import { QuotedHtml } from "./quoted-html";

const styledBlockAttributes = {
  style: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute("style"),
    renderHTML: (attrs: Record<string, string | null>) =>
      attrs.style ? { style: attrs.style } : {},
  },
  class: {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute("class"),
    renderHTML: (attrs: Record<string, string | null>) =>
      attrs.class ? { class: attrs.class } : {},
  },
  "data-signature-block": {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute("data-signature-block"),
    renderHTML: (attrs: Record<string, string | null>) =>
      attrs["data-signature-block"]
        ? { "data-signature-block": attrs["data-signature-block"] }
        : {},
  },
};

const StyledParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...styledBlockAttributes,
    };
  },
});

const StyledHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...styledBlockAttributes,
    };
  },
});

const DEFAULT_MAIL_EDITOR_PLACEHOLDER = "Write your message…";

/** The one compose schema web and native share, so a draft opens the same on either. */
export function createMailEditorExtensions(options: {
  placeholder?: string;
  /** The image node; web adds its resize handles on top of `MailImage`. */
  image?: AnyExtension;
  quoteToggleClass?: string;
  quoteRemoveClass?: string;
} = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: false,
      paragraph: false,
      link: false,
    }),
    StyledParagraph,
    StyledHeading.configure({ levels: [1, 2] }),
    LiteralLink,
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
    TextStyle,
    Color,
    options.image ?? MailImage,
    Placeholder.configure({ placeholder: options.placeholder ?? DEFAULT_MAIL_EDITOR_PLACEHOLDER }),
    Table.configure({
      resizable: true,
      HTMLAttributes: {
        border: "1",
        cellpadding: "6",
        cellspacing: "0",
        width: "100%",
        style: "width:100%;border-collapse:collapse;",
      },
    }),
    TableRow,
    TableHeader.configure({
      HTMLAttributes: {
        style: // repo-rules-allow theme-tokens-only: ships verbatim in the outgoing email HTML; mail clients ignore CSS variables.
          "padding:6px 8px;border:1px solid #ccc;background-color:#f5f5f5;color:#1f2937;text-align:left;",
      },
    }),
    TableCell.configure({
      HTMLAttributes: {
        // repo-rules-allow theme-tokens-only: style ships verbatim in the outgoing email HTML; mail clients ignore CSS variables.
        style: "padding:6px 8px;border:1px solid #ccc;vertical-align:top;",
      },
    }),
    QuotedHtml.configure({ toggleClass: options.quoteToggleClass ?? "", removeClass: options.quoteRemoveClass ?? "" }),
  ];
}
