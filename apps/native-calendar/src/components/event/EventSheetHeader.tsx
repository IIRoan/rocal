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
  onCancel,
  onSave,
  onExport,
}: {
  styles: EventSheetStyles;
  editing: boolean;
  isCreate: boolean;
  isPending: boolean;
  title: string;
  canExport: boolean;
  exporting: boolean;
  onCancel: () => void;
  onSave: () => void;
  onExport: () => void;
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
        {canExport ? (
          <Pressable
            onPress={onExport}
            disabled={exporting}
            hitSlop={8}
            style={({ pressed }) => [
              styles.headerIconButton,
              (pressed || exporting) && styles.headerIconButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Export .ics"
            accessibilityState={{ disabled: exporting }}
          >
            <Feather name="share" size={18} color={theme.colors.foreground} />
          </Pressable>
        ) : null}
      </View>
    </BottomSheetHeader>
  );
}

// BottomSheet slots chrome by direct-child displayName, so this wrapper must claim the header slot.
EventSheetHeader.displayName = "BottomSheetHeader";
