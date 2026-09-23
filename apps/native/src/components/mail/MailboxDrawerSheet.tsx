import React, { useRef } from "react";
import { Feather } from "@expo/vector-icons";
import { BottomSheet, type BottomSheetHandle } from "../BottomSheet";
import {
  SheetPageStack,
  SheetSubPage,
  useSheetPageStack,
} from "../sheet/SheetPageStack";
import {
  SheetGroup,
  SheetItem,
  SheetMessage,
  SheetScroll,
  SheetSection,
} from "../sheet/SheetSections";
import { SettingsSheetPageProvider } from "../settings/SettingsPage";
import { MailboxesSettingsContent } from "../settings/sections/MailboxesSettingsContent";
import {
  getMailboxDisplayName,
  getMailboxIcon,
} from "../../lib/mail/mail-helpers";
import type { JmapMailbox } from "../../lib/mail/types";

const ROOT_PAGE = "root";
const MANAGE_PAGE = "mailboxes";
const SNAP_POINTS = [0.6, 0.92];

interface MailboxDrawerSheetProps {
  visible: boolean;
  onDismiss: () => void;
  loading: boolean;
  mailboxes: JmapMailbox[];
  selectedMailboxId: string | null;
  onSelectMailbox: (mailboxId: string) => void;
}

/** Mail drawer: mailbox list, with mailbox management in-sheet. */
export function MailboxDrawerSheet({
  visible,
  onDismiss,
  ...listProps
}: MailboxDrawerSheetProps) {
  const sheetRef = useRef<BottomSheetHandle>(null);
  const pageStack = useSheetPageStack(ROOT_PAGE, visible);
  const { push, pop, reset } = pageStack;

  const openManage = () => {
    sheetRef.current?.snapTo(SNAP_POINTS.length - 1);
    push(MANAGE_PAGE);
  };

  return (
    <BottomSheet
      ref={sheetRef}
      visible={visible}
      onDismiss={onDismiss}
      onCloseComplete={reset}
      snapPoints={SNAP_POINTS}
      initialSnapIndex={0}
    >
      <SettingsSheetPageProvider push={push} back={pop}>
        <SheetPageStack
          state={pageStack}
          renderPage={(pageId) =>
            pageId === MANAGE_PAGE ? (
              <SheetSubPage title="Mailboxes" backLabel="Back to mail">
                <MailboxesSettingsContent />
              </SheetSubPage>
            ) : (
              <MailboxList
                {...listProps}
                onDismiss={onDismiss}
                onManage={openManage}
              />
            )
          }
        />
      </SettingsSheetPageProvider>
    </BottomSheet>
  );
}

function MailboxList({
  onDismiss,
  onManage,
  loading,
  mailboxes,
  selectedMailboxId,
  onSelectMailbox,
}: Omit<MailboxDrawerSheetProps, "visible"> & { onManage: () => void }) {
  return (
    <SheetScroll>
      <SheetSection title="Mail">
        {loading ? (
          <SheetMessage text="Loading mailboxes…" />
        ) : mailboxes.length === 0 ? (
          <SheetMessage text="No mailboxes found." />
        ) : (
          <SheetGroup>
            {mailboxes.map((mailbox) => {
              const active = mailbox.id === selectedMailboxId;
              return (
                <SheetItem
                  key={mailbox.id}
                  label={getMailboxDisplayName(mailbox)}
                  icon={
                    getMailboxIcon(mailbox) as keyof typeof Feather.glyphMap
                  }
                  checked={active}
                  onPress={() => {
                    onSelectMailbox(mailbox.id);
                    onDismiss();
                  }}
                  accessibilityState={{ selected: active }}
                />
              );
            })}
          </SheetGroup>
        )}
      </SheetSection>

      <SheetSection title="Manage">
        <SheetGroup>
          <SheetItem
            label="Mailboxes"
            icon="settings"
            chevron
            onPress={onManage}
            accessibilityLabel="Manage mailboxes"
          />
        </SheetGroup>
      </SheetSection>
    </SheetScroll>
  );
}
