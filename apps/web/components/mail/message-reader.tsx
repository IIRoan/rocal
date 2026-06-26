"use client";

export type {
  MessageReaderLoadingState,
  MessageReaderNavigationState,
  MessageReaderProps,
} from "./message-reader-types";

import { resolveMailServerLimits } from "@workspace/calendar-core";
import { useMessageReaderController } from "./use-message-reader-controller";
import { MessageReaderShell } from "./message-reader/message-reader-shell";
import type { MessageReaderProps } from "./message-reader-types";
import { EMPTY_ARRAY } from "./message-reader/constants";

export function MessageReader(props: MessageReaderProps) {
  const controller = useMessageReaderController({
    ...props,
    conversationMessages: props.conversationMessages ?? EMPTY_ARRAY,
    labels: props.labels ?? EMPTY_ARRAY,
    identities: props.identities ?? EMPTY_ARRAY,
    mailServerLimits: props.mailServerLimits ?? resolveMailServerLimits({}),
  });

  if (controller.earlyReturn) {
    return controller.earlyReturn;
  }

  if (!controller.viewModel) {
    return null;
  }

  return (
    <MessageReaderShell
      controller={controller}
      view={controller.viewModel}
    />
  );
}
