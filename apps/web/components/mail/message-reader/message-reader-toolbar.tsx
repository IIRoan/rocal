"use client";

import type {
  MessageReaderController,
  MessageReaderViewModel,
} from "../use-message-reader-controller";
import { MessageReaderDesktopToolbar } from "./message-reader-desktop-toolbar";
import { MessageReaderMobileToolbar } from "./message-reader-mobile-toolbar";

export function MessageReaderToolbar({
  controller,
  view,
}: {
  controller: MessageReaderController;
  view: MessageReaderViewModel;
}) {
  const { isMobile } = controller;

  return isMobile ? (
    <MessageReaderMobileToolbar controller={controller} view={view} />
  ) : (
    <MessageReaderDesktopToolbar controller={controller} view={view} />
  );
}
