"use client";

import { ReactNodeViewRenderer } from "@tiptap/react";
import { MailImage } from "@workspace/mail-editor";
import { ResizableImageView } from "./resizable-image-view";

export const ResizableImage = MailImage.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },
});
