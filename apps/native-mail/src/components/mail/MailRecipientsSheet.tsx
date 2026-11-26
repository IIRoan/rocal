import { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import type {
  MailRecipientSummary,
  SummarizedMailRecipient,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { BlobatarAvatar } from "@workspace/native-core/components/BlobatarAvatar";
import { BottomSheet } from "@workspace/native-core/components/BottomSheet";
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
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { MAIL_LAYOUT, useMailSkin, type MailSkin } from "@workspace/native-core/components/mail/mail-ui";
import { useRecipientActions } from "./RecipientSheet";

const ROOT_PAGE = "recipients";
const SNAP_POINTS = [0.6, 0.92];
const STACK_SIZE = 3;
const STACK_AVATAR = 24;
const GROUP_TITLES = { to: "To", cc: "Cc", bcc: "Bcc" } as const;

type MailRecipientsButtonProps = {
  summary: MailRecipientSummary;
  /** The message's full date, shown under the list. */
  fullDate: string;
};

function displayName(recipient: SummarizedMailRecipient): string {
  return recipient.name?.trim() || recipient.email;
}

/** Recipients as an avatar stack that opens a drawer listing To, Cc and Bcc. */
export function MailRecipientsButton({ summary, fullDate }: MailRecipientsButtonProps) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = createStyles(theme, skin);
  const [open, setOpen] = useState(false);
  const pageStack = useSheetPageStack(ROOT_PAGE, open);
  const lead = summary.people[0];
  if (!lead) return null;

  const others = summary.people.length - 1;
  const leadName = lead.self ? "you" : displayName(lead);
  const label = others > 0 ? `${leadName} and ${others} ${others === 1 ? "other" : "others"}` : leadName;
  const recipientsById = new Map<string, SummarizedMailRecipient>(
    summary.groups.flatMap((group) => group.recipients.map((recipient, index) => [`${group.kind}:${index}`, recipient] as const)),
  );

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={(MAIL_LAYOUT.hitSize - 34) / 2}
        style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`Recipients: ${label}`}
      >
        <View style={styles.stack}>
          {summary.people.slice(0, STACK_SIZE).map((person, index) => (
            <View key={person.email} style={[styles.disc, index > 0 && styles.overlap]}>
              <BlobatarAvatar email={person.email} name={person.name} size={STACK_AVATAR} />
            </View>
          ))}
        </View>
        <Text style={styles.pillText} numberOfLines={1}>
          {others > 0 ? summary.people.length : leadName}
        </Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="none"
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalRoot} pointerEvents="box-none">
          <BottomSheet
            visible={open}
            onDismiss={() => setOpen(false)}
            onCloseComplete={pageStack.reset}
            snapPoints={SNAP_POINTS}
            initialSnapIndex={0}
          >
            <SheetPageStack
              state={pageStack}
              renderPage={(pageId) => {
                const person = recipientsById.get(pageId);
                return person ? (
                  <RecipientPage recipient={person} onDone={() => setOpen(false)} />
                ) : (
                  <SheetSubPage title="Recipients">
                    <SheetScroll>
                      {summary.groups.map((group) => (
                        <SheetSection key={group.kind} title={GROUP_TITLES[group.kind]}>
                          <SheetGroup>
                            {group.recipients.map((recipient, index) => (
                              <SheetItem
                                key={`${group.kind}:${index}`}
                                label={recipient.self ? `${displayName(recipient)} · you` : displayName(recipient)}
                                detail={recipient.name?.trim() ? recipient.email : undefined}
                                leading={<BlobatarAvatar email={recipient.email} name={recipient.name} size={32} />}
                                chevron
                                onPress={() => pageStack.push(`${group.kind}:${index}`)}
                              />
                            ))}
                          </SheetGroup>
                        </SheetSection>
                      ))}
                      {summary.selfTag ? <SheetMessage text={`Sent to your +${summary.selfTag} address`} /> : null}
                      {fullDate ? <SheetMessage text={fullDate} /> : null}
                    </SheetScroll>
                  </SheetSubPage>
                );
              }}
            />
          </BottomSheet>
        </View>
      </Modal>
    </>
  );
}

/** One recipient, with the same actions as tapping a name elsewhere in Mail. */
function RecipientPage({ recipient, onDone }: { recipient: SummarizedMailRecipient; onDone: () => void }) {
  const actions = useRecipientActions(recipient, onDone);
  return (
    <SheetSubPage title={displayName(recipient)} backLabel="Back to recipients">
      <SheetScroll>
        <SheetSection>
          <SheetGroup>
            <SheetItem
              label={recipient.email}
              leading={<BlobatarAvatar email={recipient.email} name={recipient.name} size={32} />}
            />
          </SheetGroup>
        </SheetSection>
        <SheetSection>
          <SheetGroup>
            <SheetItem label="Copy email" icon="copy" onPress={actions.copy} />
            <SheetItem label="New message" icon="send" onPress={actions.compose} />
          </SheetGroup>
        </SheetSection>
      </SheetScroll>
    </SheetSubPage>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const view = {
    pill: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      height: 34,
      maxWidth: 160,
      paddingLeft: 5,
      paddingRight: theme.spacing["3"],
      borderRadius: 17,
      backgroundColor: skin.field,
      flexShrink: 0,
    },
    pressed: {
      opacity: 0.7,
    },
    stack: {
      flexDirection: "row" as const,
    },
    disc: {
      width: STACK_AVATAR + 4,
      height: STACK_AVATAR + 4,
      borderRadius: (STACK_AVATAR + 4) / 2,
      borderWidth: 2,
      borderColor: skin.field,
      backgroundColor: skin.pressed,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      overflow: "hidden" as const,
    },
    overlap: {
      marginLeft: -6,
    },
    modalRoot: {
      flex: 1,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    pillText: {
      ...skin.meta,
      flexShrink: 1,
      fontSize: 13,
      color: skin.textSecondary,
      fontVariant: ["tabular-nums"] as TextStyle["fontVariant"],
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
