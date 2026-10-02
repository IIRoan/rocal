import { useMemo, useState, type ComponentProps } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Feather } from "@expo/vector-icons";
import {
  getSimpleLoginForward,
  getSimpleLoginForwardNotice,
  resolveMessageReplyFrom,
  SIMPLELOGIN_DONE_KEYWORD,
  type SimpleLoginAction,
  type SimpleLoginActionKind,
  type SimpleLoginActionMode,
} from "@workspace/calendar-core";
import type { ThemeTokens } from "@workspace/design-tokens";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@workspace/native-core/components/BottomSheet";
import {
  SheetGroup,
  SheetItem,
  SheetScroll,
  SheetSection,
} from "@workspace/native-core/components/sheet/SheetSections";
import { useMailSkin, type MailSkin } from "@workspace/native-core/components/mail/mail-ui";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { useToast } from "@workspace/native-core/providers/ToastProvider";
import type { JmapEmailMessage, JmapIdentity } from "../../lib/mail/types";

const ACTION_ICONS: Record<SimpleLoginActionKind, ComponentProps<typeof Feather>["name"]> = {
  "alias-disable": "slash",
  "contact-block": "user-x",
  unsubscribe: "bell-off",
};

const LINE_HIT_SLOP = { top: 4, bottom: 8 };
const SHEET_SNAP_POINTS = [0.55];

export function MailSimpleLoginRow({
  message,
  identities,
  pending,
  onRun,
}: {
  message: JmapEmailMessage;
  identities: JmapIdentity[];
  pending: boolean;
  onRun: (message: JmapEmailMessage, mode: SimpleLoginActionMode) => void;
}) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const { toast } = useToast();
  const styles = useMemo(() => createStyles(theme, skin), [skin, theme]);
  const [open, setOpen] = useState(false);
  const forward = getSimpleLoginForward(message);
  if (!forward) return null;
  const notice = getSimpleLoginForwardNotice(forward, message.from);
  const alias = notice.alias;
  // A mailto command only works from the mailbox SimpleLogin forwards to.
  const action =
    forward.action &&
    (forward.action.target.type !== "mailto" || resolveMessageReplyFrom(identities, message))
      ? forward.action
      : null;
  const done = message.keywords?.[SIMPLELOGIN_DONE_KEYWORD] === true;
  const status = action ? (pending ? action.pendingLabel : done ? action.doneLabel : null) : null;
  const close = () => setOpen(false);

  const copyAlias = async (value: string) => {
    await Clipboard.setStringAsync(value);
    toast("Alias copied");
    close();
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={LINE_HIT_SLOP}
        style={styles.line}
        accessibilityRole="button"
        accessibilityLabel="SimpleLogin alias details"
      >
        <Feather name="shuffle" size={12} color={skin.textTertiary} />
        <Text style={styles.lineText} numberOfLines={1}>
          {status ? `Via SimpleLogin · ${status}` : "Via SimpleLogin"}
        </Text>
        <Feather name="chevron-right" size={14} color={skin.textTertiary} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="none"
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={close}
      >
        <View style={styles.modalRoot} pointerEvents="box-none">
          <BottomSheet visible={open} onDismiss={close} snapPoints={SHEET_SNAP_POINTS}>
            <BottomSheetHeader>
              <BottomSheetTitle>SimpleLogin</BottomSheetTitle>
            </BottomSheetHeader>
            <SheetScroll>
              <SheetSection title="Alias" footer={notice.detail}>
                <SheetGroup>
                  <SheetItem
                    icon="shuffle"
                    label={alias ?? notice.label}
                    detail={status ?? (alias ? notice.label : undefined)}
                    accessory={alias ? "copy" : undefined}
                    onPress={alias ? () => void copyAlias(alias) : undefined}
                    accessibilityLabel={alias ? `Copy alias ${alias}` : undefined}
                  />
                </SheetGroup>
              </SheetSection>
              {action ? (
                <SimpleLoginActionSection
                  action={action}
                  done={done}
                  pending={pending}
                  onClose={close}
                  onConfirm={(mode) => onRun(message, mode)}
                />
              ) : null}
            </SheetScroll>
          </BottomSheet>
        </View>
      </Modal>
    </>
  );
}

/** The sheet closes before the confirm so the undo browser never presents over a dismissing modal. */
function SimpleLoginActionSection({
  action,
  done,
  pending,
  onClose,
  onConfirm,
}: {
  action: SimpleLoginAction;
  done: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: (mode: SimpleLoginActionMode) => void;
}) {
  if (done) {
    const undo = action.undo;
    if (!undo) return null;
    return (
      <SheetSection footer={undo.confirmMessage}>
        <SheetGroup>
          <SheetItem
            icon="rotate-ccw"
            label={undo.label}
            accessory="external-link"
            onPress={() => {
              onClose();
              Alert.alert(undo.confirmTitle, undo.confirmMessage, [
                { text: "Cancel", style: "cancel" },
                { text: undo.confirmLabel, onPress: () => onConfirm("undo") },
              ]);
            }}
          />
        </SheetGroup>
      </SheetSection>
    );
  }

  const destructive = action.kind !== "unsubscribe";
  return (
    <SheetSection footer={action.confirmMessage}>
      <SheetGroup>
        <SheetItem
          icon={ACTION_ICONS[action.kind]}
          label={action.label}
          tone={destructive ? "destructive" : "default"}
          pending={pending}
          onPress={() => {
            onClose();
            Alert.alert(action.confirmTitle, action.confirmMessage, [
              { text: "Cancel", style: "cancel" },
              {
                text: action.label,
                style: destructive ? "destructive" : "default",
                onPress: () => onConfirm("run"),
              },
            ]);
          }}
        />
      </SheetGroup>
    </SheetSection>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const view = {
    line: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      minWidth: 0,
    },
    modalRoot: {
      flex: 1,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    lineText: {
      ...skin.meta,
      flexShrink: 1,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
