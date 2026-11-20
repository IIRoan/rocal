import React, { useRef } from "react";
import { Feather } from "@expo/vector-icons";
import { BottomSheet, type BottomSheetHandle } from "@workspace/native-core/components/BottomSheet";
import {
  SheetPageStack,
  SheetSubPage,
  useSheetPageStack,
} from "@workspace/native-core/components/sheet/SheetPageStack";
import {
  SheetGroup,
  SheetItem,
  SheetMessage,
  SheetScroll,
  SheetSection,
} from "@workspace/native-core/components/sheet/SheetSections";
import { SettingsSheetPageProvider } from "@workspace/native-core/components/settings/SettingsPage";
import { MailboxesSettingsContent } from "../settings/sections/MailboxesSettingsContent";
import { MailScheduledContent } from "./MailScheduledContent";
import { useScheduledMailSends } from "../../hooks/use-scheduled-mail-sends";
import {
  getMailboxDisplayName,
  getMailboxIcon,
  isSpamMailboxRole,
} from "../../lib/mail/mail-helpers";
import type { JmapMailbox } from "../../lib/mail/types";

const ROOT_PAGE = "root";
const MANAGE_PAGE = "mailboxes";
const SCHEDULED_PAGE = "scheduled";
const SNAP_POINTS = [0.6, 0.92];

interface MailboxDrawerSheetProps {
  visible: boolean;
  onDismiss: () => void;
  loading: boolean;
  mailboxes: JmapMailbox[];
  selectedMailboxId: string | null;
  onSelectMailbox: (mailboxId: string) => void;
  onEmptyMailbox: (mailbox: JmapMailbox) => void;
  emptyingMailboxId: string | null;
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

  const openPage = (page: string) => {
    sheetRef.current?.snapTo(SNAP_POINTS.length - 1);
    push(page);
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
            ) : pageId === SCHEDULED_PAGE ? (
              <SheetSubPage title="Scheduled" backLabel="Back to mail">
                <MailScheduledContent />
              </SheetSubPage>
            ) : (
              <MailboxList
                {...listProps}
                onDismiss={onDismiss}
                onManage={() => openPage(MANAGE_PAGE)}
                onOpenScheduled={() => openPage(SCHEDULED_PAGE)}
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
  onOpenScheduled,
  loading,
  mailboxes,
  selectedMailboxId,
  onSelectMailbox,
  onEmptyMailbox,
  emptyingMailboxId,
}: Omit<MailboxDrawerSheetProps, "visible"> & { onManage: () => void; onOpenScheduled: () => void }) {
  const scheduledCount = useScheduledMailSends().sends.length;
  const emptyableMailboxes = mailboxes.filter(
    (mailbox) => mailbox.role === "trash" || isSpamMailboxRole(mailbox.role),
  );
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
            {scheduledCount > 0 ? (
              <SheetItem
                label={`Scheduled (${scheduledCount})`}
                icon="clock"
                chevron
                onPress={onOpenScheduled}
              />
            ) : null}
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
          {emptyableMailboxes.map((mailbox) => (
            <SheetItem
              key={mailbox.id}
              label={`Empty ${getMailboxDisplayName(mailbox)}`}
              icon="trash-2"
              tone="destructive"
              pending={emptyingMailboxId === mailbox.id}
              disabled={emptyingMailboxId !== null}
              onPress={() => onEmptyMailbox(mailbox)}
            />
          ))}
        </SheetGroup>
      </SheetSection>
    </SheetScroll>
  );
}
