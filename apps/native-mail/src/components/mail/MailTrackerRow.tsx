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
import { Feather } from "@expo/vector-icons";
import {
  getMailTrackerNotice,
  type EmailTrackerSummary,
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
import { MAIL_LAYOUT, useMailSkin, type MailSkin } from "@workspace/native-core/components/mail/mail-ui";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";

const SHEET_SNAP_POINTS = [0.5];

export function MailTrackerRow({ trackers }: { trackers: EmailTrackerSummary }) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = createStyles(theme, skin);
  const [open, setOpen] = useState(false);
  if (trackers.count === 0) return null;
  const notice = getMailTrackerNotice(trackers);
  const close = () => setOpen(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={styles.line}
        accessibilityRole="button"
        accessibilityLabel={`${notice.label}. Show details`}
      >
        <Feather name="shield" size={12} color={skin.textTertiary} />
        <Text style={styles.lineText} numberOfLines={1}>
          {notice.label}
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
              <BottomSheetTitle>{notice.label}</BottomSheetTitle>
            </BottomSheetHeader>
            <SheetScroll>
              <SheetSection footer={notice.detail}>
                <SheetGroup>
                  {trackers.hosts.map((host) => (
                    <SheetItem key={host} icon="shield" label={host} />
                  ))}
                </SheetGroup>
              </SheetSection>
            </SheetScroll>
          </BottomSheet>
        </View>
      </Modal>
    </>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const view = {
    line: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["1"],
      minWidth: 0,
      minHeight: MAIL_LAYOUT.hitSize,
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
