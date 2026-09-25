import { useMemo } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import {
  BottomSheet,
  BottomSheetFooter,
  BottomSheetHeader,
  BottomSheetScrollView,
  BottomSheetTitle,
} from "@workspace/native-core/components/BottomSheet";
import { SheetNavButton } from "@workspace/native-core/components/sheet/SheetNavButton";
import { SheetRow } from "@workspace/native-core/components/sheet/SheetRow";
import { sheetBottomPadding } from "@workspace/native-core/components/sheet/sheet-padding";
import { MailSheetList } from "./MailSheetList";
import { MailLabelsSheet } from "./MailLabelsSheet";
import { mailSpacing } from "@workspace/native-core/components/mail/mail-ui";
import {
  getMailboxDisplayName,
  isSpamMailboxRole,
} from "../../lib/mail/mail-helpers";
import type { JmapEmailMessage, LabelDef } from "../../lib/mail/types";
import type {
  MailMessageActions,
  MessageSheetView,
} from "../../hooks/use-mail-message-actions";

const SHEET_TITLES: Record<Exclude<MessageSheetView, null>, string> = {
  menu: "Actions",
  move: "Move to",
  label: "Labels",
  html: "HTML source",
};

const SHEET_SNAP_POINTS: Record<Exclude<MessageSheetView, null>, number[]> = {
  menu: [0.7],
  move: [0.55],
  label: [0.7],
  html: [0.92],
};

type MailMessageActionsSheetProps = {
  actions: MailMessageActions;
  labels: LabelDef[];
  messageKeywords: JmapEmailMessage["keywords"] | undefined;
  rawHtmlSource: string | null;
  createLabel: (name: string, color: string) => Promise<LabelDef>;
  deleteLabel: (labelId: string) => Promise<void>;
};

export function MailMessageActionsSheet({
  actions,
  labels,
  messageKeywords,
  rawHtmlSource,
  createLabel,
  deleteLabel,
}: MailMessageActionsSheetProps) {
  const { theme } = useTheme();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const sheetPad = sheetBottomPadding(insets.bottom);
  const sheetH = mailSpacing(theme).sheetH;
  const { activeSheetView, setActiveSheetView } = actions;
  const showMenu = () => setActiveSheetView("menu");
  const labelName = (labelId: string) =>
    labels.find((label) => label.id === labelId)?.name ?? labelId;

  return (
    <BottomSheet
      visible={activeSheetView !== null}
      onDismiss={() => setActiveSheetView(null)}
      snapPoints={SHEET_SNAP_POINTS[activeSheetView ?? "move"]}
    >
      <BottomSheetHeader>
        <BottomSheetTitle>
          {SHEET_TITLES[activeSheetView ?? "menu"]}
        </BottomSheetTitle>
      </BottomSheetHeader>
      {activeSheetView === "menu" ? (
        <MessageMenuContent
          actions={actions}
          hasHtmlSource={Boolean(rawHtmlSource)}
          sheetH={sheetH}
        />
      ) : activeSheetView === "move" ? (
        <BottomSheetScrollView
          contentContainerStyle={{
            paddingHorizontal: sheetH,
            paddingTop: 8,
            paddingBottom: sheetPad,
            gap: 8,
          }}
        >
          <SheetNavButton label="Actions" onPress={showMenu} />
          <MailSheetList>
            {actions.moveTargets.map((mailbox, index) => (
              <SheetRow
                key={mailbox.id}
                variant="mail"
                icon="folder"
                label={getMailboxDisplayName(mailbox)}
                onPress={() => actions.handleMoveToMailbox(mailbox.id)}
                showDivider={index > 0}
              />
            ))}
          </MailSheetList>
        </BottomSheetScrollView>
      ) : activeSheetView === "label" ? (
        <BottomSheetScrollView
          contentContainerStyle={{
            paddingHorizontal: sheetH,
            paddingTop: 8,
            paddingBottom: sheetPad,
          }}
        >
          <MailLabelsSheet
            labels={labels}
            messageKeywords={messageKeywords}
            onBack={showMenu}
            onToggleLabel={(labelId, assigned) => {
              actions.handleSetLabel(labelId, assigned);
              setActiveSheetView(null);
              toast(
                assigned
                  ? `Added "${labelName(labelId)}"`
                  : `Removed "${labelName(labelId)}"`,
              );
            }}
            onCreateLabel={async (name, color) => {
              const newLabel = await createLabel(name, color);
              actions.handleSetLabel(newLabel.id, true);
              toast(`Created "${newLabel.name}"`);
              setActiveSheetView(null);
            }}
            onDeleteLabel={async (labelId) => {
              const name = labelName(labelId);
              await deleteLabel(labelId);
              toast(`Deleted "${name}"`);
            }}
          />
        </BottomSheetScrollView>
      ) : activeSheetView === "html" ? (
        <BottomSheetScrollView
          contentContainerStyle={{
            paddingHorizontal: sheetH,
            paddingTop: 8,
            paddingBottom: sheetPad,
            gap: 8,
          }}
        >
          <SheetNavButton label="Actions" onPress={showMenu} />
          <View style={styles.htmlSourceCard}>
            <Text selectable style={styles.htmlSourceText}>
              {rawHtmlSource ?? ""}
            </Text>
          </View>
        </BottomSheetScrollView>
      ) : null}
    </BottomSheet>
  );
}

function MessageMenuContent({
  actions,
  hasHtmlSource,
  sheetH,
}: {
  actions: MailMessageActions;
  hasHtmlSource: boolean;
  sheetH: number;
}) {
  const role = actions.currentMailboxRole;
  const isTrash = role === "trash";
  const isSpam = isSpamMailboxRole(role);
  const isArchive = role === "archive";

  return (
    <>
      <BottomSheetScrollView
        contentContainerStyle={{
          paddingHorizontal: sheetH,
          paddingTop: 8,
          paddingBottom: 12,
        }}
      >
        <MailSheetList>
          <SheetRow
            variant="mail"
            icon="corner-up-left"
            label="Reply all"
            onPress={actions.handleReplyAll}
          />
          <SheetRow
            variant="mail"
            icon="corner-up-right"
            label="Forward"
            onPress={actions.handleForward}
          />
          {actions.archiveMailboxId && !isArchive ? (
            <SheetRow
              variant="mail"
              icon="archive"
              label="Archive"
              onPress={actions.handleArchive}
              disabled={actions.isActionBusy}
              showDivider
            />
          ) : null}
          <SheetRow
            variant="mail"
            icon="star"
            label={actions.isFlagged ? "Unstar" : "Star"}
            onPress={actions.handleToggleStar}
            showDivider
          />
          {actions.isSeen ? (
            <SheetRow
              variant="mail"
              icon="mail"
              label="Mark as unread"
              onPress={actions.handleMarkUnread}
              showDivider
            />
          ) : null}
          <SheetRow
            variant="mail"
            icon="tag"
            label="Labels"
            accessory="chevron-right"
            onPress={() => actions.setActiveSheetView("label")}
            showDivider
          />
          {actions.spamMailboxId && !isSpam && !isTrash ? (
            <SheetRow
              variant="mail"
              icon="alert-octagon"
              label="Report spam"
              onPress={actions.handleReportSpam}
              showDivider
            />
          ) : null}
          {(isTrash || isSpam) && actions.inboxMailboxId ? (
            <SheetRow
              variant="mail"
              icon="inbox"
              label={isSpam ? "Not spam" : "Restore to inbox"}
              onPress={actions.handleRestoreToInbox}
              showDivider
            />
          ) : null}
          {actions.moveTargets.length > 0 ? (
            <SheetRow
              variant="mail"
              icon="folder"
              label="Move to…"
              accessory="chevron-right"
              onPress={() => actions.setActiveSheetView("move")}
              showDivider
            />
          ) : null}
          {hasHtmlSource ? (
            <SheetRow
              variant="mail"
              icon="code"
              label="View HTML source"
              accessory="chevron-right"
              onPress={() => actions.setActiveSheetView("html")}
              showDivider
            />
          ) : null}
        </MailSheetList>
      </BottomSheetScrollView>
      <BottomSheetFooter>
        <MailSheetList>
          <SheetRow
            variant="mail"
            icon="trash-2"
            label={isTrash ? "Delete message" : "Move to trash"}
            destructive
            onPress={actions.handleMoveToTrash}
            disabled={actions.isActionBusy}
          />
        </MailSheetList>
      </BottomSheetFooter>
    </>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    htmlSourceCard: {
      padding: theme.spacing["3"],
      borderRadius: theme.borderRadius.lg,
      backgroundColor: theme.colors.muted + "28",
    },
    htmlSourceText: {
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.sm.lineHeight,
      color: theme.colors.foreground,
      fontFamily: Platform.select({
        ios: "Menlo",
        android: "monospace",
        default: "monospace",
      }),
    },
  });
}
