import type { Dispatch } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  getSimpleLoginComposeNotice,
  validateComposeRecipients,
  type SimpleLoginComposeNotice,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import { LAYOUT_METRICS } from "@workspace/native-core/lib/app-layout";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useMailSkin, type MailSkin } from "@workspace/native-core/components/mail/mail-ui";
import type { ComposeFormAction, ComposeFormState } from "../../lib/mail/compose-form";
import type { ComposeMode } from "../../lib/mail/compose-request";
import {
  collectCommittedEmails,
  parseRecipientField,
  recipientChipLabel,
} from "../../lib/mail/compose-recipients";
import type { JmapEmailMessage, JmapIdentity } from "../../lib/mail/types";
import type { resolveComposeContext } from "../../lib/mail/use-mail";
import { ComposeRecipientField } from "./ComposeRecipientField";

const NO_SIMPLELOGIN_NOTICE: SimpleLoginComposeNotice = { via: null, requiredFrom: null };

type ComposeRecipientFieldsProps = Pick<ComposeFormState, "to" | "cc" | "bcc" | "showCcBcc"> & {
  dispatch: Dispatch<ComposeFormAction>;
  mode: ComposeMode | undefined;
  sourceMessage: JmapEmailMessage | null;
  identities: JmapIdentity[];
  composeContext: ReturnType<typeof resolveComposeContext>;
  onChooseIdentity: () => void;
  onSelectIdentity: (id: string) => void;
  onSubmitEmpty: () => void;
  /** A reply keeps its thread's recipients: they are shown, not edited. */
  lockedTo?: boolean;
};

/** To, Cc, Bcc and From rows, plus the SimpleLogin reply notices. */
export function ComposeRecipientFields({
  to,
  cc,
  bcc,
  showCcBcc,
  dispatch,
  mode,
  sourceMessage,
  identities,
  composeContext,
  onChooseIdentity,
  onSelectIdentity,
  onSubmitEmpty,
  lockedTo = false,
}: ComposeRecipientFieldsProps) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = createStyles(theme, skin);
  const canChooseIdentity = Boolean(composeContext) && identities.length > 1;
  const parsedRecipients = validateComposeRecipients({ to, cc, bcc });
  const simpleLoginNotice =
    sourceMessage && (mode === "reply" || mode === "reply-all")
      ? getSimpleLoginComposeNotice({
          message: sourceMessage,
          identities,
          fromEmail: composeContext?.fromEmail,
          recipients: [
            ...parsedRecipients.to,
            ...parsedRecipients.cc,
            ...parsedRecipients.bcc,
          ].map((address) => address.email),
        })
      : NO_SIMPLELOGIN_NOTICE;

  const ccToggle = (
    <Pressable
      onPress={() => dispatch({ type: "toggleCcBcc" })}
      style={({ pressed }) => [styles.ccToggle, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={showCcBcc ? "Hide Cc, Bcc, and From" : "Show Cc, Bcc, and From"}
      accessibilityState={{ expanded: showCcBcc }}
    >
      <Text style={[styles.ccToggleText, showCcBcc && styles.ccToggleOn]}>Cc</Text>
      <Text style={[styles.ccToggleText, showCcBcc && styles.ccToggleOn]}>Bcc</Text>
    </Pressable>
  );

  return (
    <>
      {lockedTo ? (
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>To</Text>
          <View style={styles.fixedRecipients}>
            {parseRecipientField(to).chips.map((chip) => {
              const label = recipientChipLabel(chip);
              return (
                <View key={chip.email} style={styles.fixedRecipient} accessible accessibilityLabel={`To ${label}`}>
                  <View style={styles.initial}>
                    <Text style={styles.initialText}>{label.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.fixedName} numberOfLines={1}>
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
          {ccToggle}
        </View>
      ) : (
        <ComposeRecipientField
          value={to}
          onChangeText={(value) => dispatch({ type: "edit", field: "to", value })}
          label="To"
          excludeEmails={collectCommittedEmails(cc, bcc)}
          onSubmitEmpty={onSubmitEmpty}
          trailing={ccToggle}
        />
      )}
      {showCcBcc ? (
        <>
          <ComposeRecipientField
            value={cc}
            onChangeText={(value) => dispatch({ type: "edit", field: "cc", value })}
            label="Cc"
            excludeEmails={collectCommittedEmails(to, bcc)}
            onSubmitEmpty={onSubmitEmpty}
          />
          <ComposeRecipientField
            value={bcc}
            onChangeText={(value) => dispatch({ type: "edit", field: "bcc", value })}
            label="Bcc"
            excludeEmails={collectCommittedEmails(to, cc)}
            onSubmitEmpty={onSubmitEmpty}
          />
          {composeContext ? (
            <Pressable
              style={({ pressed }) => [
                styles.fieldRow,
                pressed && canChooseIdentity && styles.pressed,
              ]}
              onPress={canChooseIdentity ? onChooseIdentity : undefined}
              accessibilityRole="button"
              accessibilityLabel="Choose sending identity"
            >
              <Text style={styles.fieldLabel}>From</Text>
              <Text style={styles.fieldValue} numberOfLines={1}>
                {composeContext.fromName
                  ? `${composeContext.fromName}`
                  : composeContext.fromEmail}
              </Text>
              {canChooseIdentity ? (
                <Feather name="chevron-down" size={16} color={skin.textTertiary} />
              ) : null}
            </Pressable>
          ) : null}
        </>
      ) : null}

      {simpleLoginNotice.via ? (
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Via</Text>
          <Feather name="shuffle" size={14} color={skin.textTertiary} />
          <View style={styles.fieldValueStack}>
            <Text style={styles.viaAlias} numberOfLines={1} ellipsizeMode="middle">
              {simpleLoginNotice.via.alias}
            </Text>
            <Text style={styles.noticeInline} numberOfLines={2}>
              {simpleLoginNotice.via.detail}
            </Text>
          </View>
        </View>
      ) : null}

      {simpleLoginNotice.requiredFrom ? (
        <Pressable
          style={({ pressed }) => [styles.fieldRow, pressed && styles.pressed]}
          onPress={() => {
            if (simpleLoginNotice.requiredFrom) {
              onSelectIdentity(simpleLoginNotice.requiredFrom.identityId);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel={`${simpleLoginNotice.requiredFrom.detail} Switch From.`}
        >
          <Feather name="alert-circle" size={14} color={theme.colors.destructive} />
          <Text style={styles.requiredFromText}>
            {simpleLoginNotice.requiredFrom.detail}
          </Text>
          <Text style={styles.requiredFromAction}>Switch From</Text>
        </Pressable>
      ) : null}
    </>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const view = {
    fieldRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["3"],
      minHeight: LAYOUT_METRICS.hitSize + theme.spacing["2"],
      paddingHorizontal: theme.spacing["4"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: skin.borderPrimary,
    },
    fieldValueStack: {
      flex: 1,
      minWidth: 0,
      gap: 2,
      paddingVertical: theme.spacing["2"],
    },
    ccToggle: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["3"],
      height: LAYOUT_METRICS.hitSize,
      paddingHorizontal: theme.spacing["2"],
      flexShrink: 0,
    },
    fixedRecipients: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      alignItems: "center" as const,
      gap: theme.spacing["3"],
      paddingVertical: theme.spacing["2"],
    },
    fixedRecipient: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      maxWidth: "100%" as const,
    },
    initial: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: skin.field,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    pressed: {
      backgroundColor: skin.pressed,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    fieldLabel: {
      ...skin.body,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: skin.textTertiary,
    },
    fieldValue: {
      flex: 1,
      minWidth: 0,
      fontSize: skin.body.fontSize,
      color: theme.colors.foreground,
    },
    ccToggleText: {
      ...skin.meta,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: skin.textSecondary,
    },
    ccToggleOn: {
      color: theme.colors.primaryBase,
    },
    initialText: {
      fontSize: 11,
      fontWeight: "700" as TextStyle["fontWeight"],
      color: theme.colors.primaryBase,
    },
    fixedName: {
      flexShrink: 1,
      fontSize: skin.body.fontSize,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    viaAlias: {
      fontSize: skin.body.fontSize,
      color: theme.colors.foreground,
    },
    requiredFromText: {
      ...skin.meta,
      flex: 1,
      minWidth: 0,
      paddingVertical: theme.spacing["2"],
      color: theme.colors.destructive,
    },
    requiredFromAction: {
      ...skin.meta,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: theme.colors.primaryBase,
    },
    noticeInline: {
      ...skin.meta,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
