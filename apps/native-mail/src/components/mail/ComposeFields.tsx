import { useRef, type ComponentProps, type Dispatch } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import { LAYOUT_METRICS } from "@workspace/native-core/lib/app-layout";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useMailSkin, type MailSkin } from "@workspace/native-core/components/mail/mail-ui";
import type { PendingComposeAttachment } from "../../lib/mail/compose-attachments";
import type { ComposeFormAction } from "../../lib/mail/compose-form";
import { ComposeAttachmentList } from "./ComposeAttachmentList";
import { ComposeRecipientFields } from "./ComposeRecipientFields";

type RecipientProps = Omit<ComponentProps<typeof ComposeRecipientFields>, "onSubmitEmpty" | "dispatch">;

type ComposeFieldsProps = RecipientProps & {
  dispatch: Dispatch<ComposeFormAction>;
  subject: string;
  /** A reply keeps its thread's subject. */
  threadReply: boolean;
  mailboxLoading: boolean;
  attachments: PendingComposeAttachment[];
  error: string | null;
};

/** Recipients and subject above the body: editable rows for a new message, the thread's own for a reply. */
export function ComposeFields({
  dispatch,
  subject,
  threadReply,
  mailboxLoading,
  attachments,
  error,
  ...recipients
}: ComposeFieldsProps) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = createStyles(theme, skin);
  const subjectInputRef = useRef<TextInputInstance>(null);

  return (
    <View style={styles.fields}>
      {mailboxLoading && !recipients.composeContext ? (
        <View style={styles.fieldRow}>
          <ActivityIndicator size="small" color={skin.textTertiary} />
          <Text style={styles.notice}>Preparing your mailbox…</Text>
        </View>
      ) : null}
      {!mailboxLoading && !recipients.composeContext ? (
        <Text style={styles.noticeBlock}>Your mailbox cannot send messages right now.</Text>
      ) : null}

      <ComposeRecipientFields
        {...recipients}
        dispatch={dispatch}
        onSubmitEmpty={() => subjectInputRef.current?.focus()}
      />

      {threadReply ? (
        <View style={styles.replySubject} accessible accessibilityLabel={`Subject ${subject}`} testID="compose-reply-subject">
          <Feather name="corner-up-left" size={14} color={skin.textTertiary} />
          <Text style={styles.replySubjectText} numberOfLines={1}>
            {subject}
          </Text>
        </View>
      ) : (
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Subject</Text>
          <TextInput
            ref={subjectInputRef}
            style={styles.subjectInput}
            value={subject}
            onChangeText={(value) => dispatch({ type: "edit", field: "subject", value })}
            placeholder="What’s it about?"
            placeholderTextColor={skin.textTertiary}
            selectionColor={theme.colors.primaryBase}
            cursorColor={theme.colors.primaryBase}
            autoCapitalize="sentences"
            autoCorrect
            autoFocus={false}
            accessibilityLabel="Subject"
            testID="compose-subject"
          />
        </View>
      )}

      {attachments.length > 0 ? (
        <ComposeAttachmentList attachments={attachments} onRemove={(id) => dispatch({ type: "detach", id })} />
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const view = {
    fields: {
      flexShrink: 0,
      paddingBottom: theme.spacing["2"],
    },
    fieldRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["3"],
      minHeight: LAYOUT_METRICS.hitSize + theme.spacing["1"],
      marginLeft: theme.spacing["4"],
      paddingRight: theme.spacing["4"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: skin.borderPrimary,
    },
    replySubject: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      paddingHorizontal: theme.spacing["4"],
      paddingTop: theme.spacing["3"],
      paddingBottom: theme.spacing["1"],
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    fieldLabel: {
      ...skin.body,
      color: skin.textTertiary,
    },
    subjectInput: {
      flex: 1,
      minWidth: 0,
      minHeight: LAYOUT_METRICS.hitSize,
      paddingVertical: theme.spacing["2"],
      fontSize: skin.body.fontSize,
      color: theme.colors.foreground,
    },
    replySubjectText: {
      ...skin.meta,
      flexShrink: 1,
      fontSize: 14,
      color: skin.textSecondary,
    },
    notice: {
      ...skin.meta,
    },
    noticeBlock: {
      ...skin.meta,
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
    },
    error: {
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["2"],
      fontSize: 13,
      lineHeight: 17,
      color: theme.colors.destructive,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
