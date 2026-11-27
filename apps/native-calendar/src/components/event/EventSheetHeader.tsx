import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import {
  BottomSheetClose,
  BottomSheetHeader,
  BottomSheetTitle,
} from "@workspace/native-core/components/BottomSheet";
import type { EventSheetStyles } from "./event-sheet-styles";

export function EventSheetHeader({
  styles,
  editing,
  isCreate,
  isPending,
  title,
  canExport,
  exporting,
  canDuplicate,
  onCancel,
  onSave,
  onExport,
  onDuplicate,
}: {
  styles: EventSheetStyles;
  editing: boolean;
  isCreate: boolean;
  isPending: boolean;
  title: string;
  canExport: boolean;
  exporting: boolean;
  canDuplicate: boolean;
  onCancel: () => void;
  onSave: () => void;
  onExport: () => void;
  onDuplicate: () => void;
}) {
  const { theme } = useTheme();

  if (editing) {
    return (
      <BottomSheetHeader showClose={false} style={styles.formHeader}>
        <View style={styles.formHeaderRow}>
          <BottomSheetClose
            onPress={onCancel}
            accessibilityLabel={isCreate ? "Discard event" : "Cancel editing"}
          />
          <Pressable
            onPress={onSave}
            disabled={isPending}
            hitSlop={4}
            style={({ pressed }) => [
              styles.savePill,
              (pressed || isPending) && styles.savePillPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Save"
            accessibilityState={{ disabled: isPending }}
          >
            {isPending ? (
              <ActivityIndicator
                size="small"
                color={theme.colors.primaryForeground}
              />
            ) : (
              <Text style={styles.savePillText}>Save</Text>
            )}
          </Pressable>
        </View>
      </BottomSheetHeader>
    );
  }

  return (
    <BottomSheetHeader>
      <View style={styles.viewHeaderRow}>
        <BottomSheetTitle style={styles.viewHeaderTitle}>
          {title}
        </BottomSheetTitle>
        {canDuplicate ? (
          <HeaderIconButton
            styles={styles}
            icon="copy"
            label="Duplicate event"
            busy={isPending}
            onPress={onDuplicate}
          />
        ) : null}
        {canExport ? (
          <HeaderIconButton
            styles={styles}
            icon="share"
            label="Export .ics"
            busy={exporting}
            onPress={onExport}
          />
        ) : null}
      </View>
    </BottomSheetHeader>
  );
}

// BottomSheet slots chrome by direct-child displayName, so this wrapper must claim the header slot.
EventSheetHeader.displayName = "BottomSheetHeader";

function HeaderIconButton({
  styles,
  icon,
  label,
  busy,
  onPress,
}: {
  styles: EventSheetStyles;
  icon: keyof typeof Feather.glyphMap;
  label: string;
  busy: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      hitSlop={8}
      style={({ pressed }) => [
        styles.headerIconButton,
        (pressed || busy) && styles.headerIconButtonPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy }}
    >
      <Feather name={icon} size={18} color={theme.colors.foreground} />
    </Pressable>
  );
}
