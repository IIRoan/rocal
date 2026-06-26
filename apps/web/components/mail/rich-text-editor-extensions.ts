import Paragraph from "@tiptap/extension-paragraph";
import Heading from "@tiptap/extension-heading";
import Underline from "@tiptap/extension-underline";
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
import { ResizableImage } from "./resizable-image";
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

export const DEFAULT_RICH_TEXT_PLACEHOLDER = "Write your message…";

export const richTextEditorExtensions = [
  StarterKit.configure({
    heading: false,
    paragraph: false,
    link: false,
    underline: false,
  }),
  StyledParagraph,
  StyledHeading.configure({ levels: [1, 2] }),
  Underline,
  LiteralLink,
  TextAlign.configure({
    types: ["heading", "paragraph"],
  }),
  TextStyle,
  Color,
  ResizableImage,
  Placeholder.configure({ placeholder: DEFAULT_RICH_TEXT_PLACEHOLDER }),
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
      style:
        "padding:6px 8px;border:1px solid #ccc;background-color:#f5f5f5;color:#1f2937;text-align:left;",
    },
  }),
  TableCell.configure({
    HTMLAttributes: {
      style: "padding:6px 8px;border:1px solid #ccc;vertical-align:top;",
    },
  }),
  QuotedHtml,
];
