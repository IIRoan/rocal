import { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import type { JmapIdentity } from "../../lib/mail/types";
import {
  BottomSheet,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@workspace/native-core/components/BottomSheet";
import { useMailSkin, type MailSkin } from "@workspace/native-core/components/mail/mail-ui";

type ComposeIdentitySheetProps = {
  visible: boolean;
  identities: JmapIdentity[];
  selectedIdentityId: string | null;
  onSelect: (identityId: string) => void;
  onDismiss: () => void;
};

export function ComposeIdentitySheet({
  visible,
  identities,
  selectedIdentityId,
  onSelect,
  onDismiss,
}: ComposeIdentitySheetProps) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = useMemo(() => createStyles(theme, skin), [theme, skin]);

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} snapPoints={[0.45]}>
      <BottomSheetHeader>
        <BottomSheetTitle>Send from</BottomSheetTitle>
      </BottomSheetHeader>
      {identities.map((identity) => {
        const selected = identity.id === selectedIdentityId;
        return (
          <Pressable
            key={identity.id}
            onPress={() => onSelect(identity.id)}
            style={({ pressed }) => [
              styles.row,
              selected && styles.rowSelected,
              pressed && styles.rowPressed,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <View style={styles.text}>
              {identity.name?.trim() ? (
                <Text style={styles.name} numberOfLines={1}>
                  {identity.name}
                </Text>
              ) : null}
              <Text style={styles.email} numberOfLines={1}>
                {identity.email}
              </Text>
            </View>
            {selected ? (
              <Feather name="check" size={16} color={theme.colors.foreground} />
            ) : null}
          </Pressable>
        );
      })}
    </BottomSheet>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const view = {
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: theme.spacing["3"],
      minHeight: 52,
      paddingVertical: theme.spacing["2"],
      paddingHorizontal: theme.spacing["4"],
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: skin.borderTertiary,
    },
    rowSelected: {
      backgroundColor: skin.selected,
    },
    rowPressed: {
      backgroundColor: skin.pressed,
    },
    text: {
      flex: 1,
      minWidth: 0,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    name: {
      fontSize: skin.body.fontSize,
      lineHeight: skin.body.lineHeight,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    email: {
      ...skin.meta,
      color: skin.textSecondary,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
