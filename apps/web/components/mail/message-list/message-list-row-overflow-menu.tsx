"use client";

import type { ComponentProps } from "react";
import {
  Dropdown,
  FilledVariant,
  Icon,
  IconButton,
  Size,
  Type,
} from "@workspace/ui/solace";
import { MessageListRowContextMenu } from "./message-list-row-context-menu";

export function MessageListRowOverflowMenu(
  props: ComponentProps<typeof MessageListRowContextMenu>,
) {
  return (
    <Dropdown
      width={220}
      trigger={
        <IconButton
          icon={Icon.OverflowH}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          size={Size.SMALL}
          tooltip="Message actions"
          type={Type.SECONDARY}
          variant={FilledVariant.UNFILLED}
          className="size-6! data-[state=open]:bg-[var(--bg-overlay-secondary)]"
        />
      }
    >
      <MessageListRowContextMenu {...props} />
    </Dropdown>
  );
}
