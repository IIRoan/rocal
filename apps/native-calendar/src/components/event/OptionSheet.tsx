import { useMemo } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import { PickerSheet } from "./EventPickerSheets";

export interface OptionSheetItem {
  key: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
  swatch?: string;
  separatorBefore?: boolean;
}

export function OptionSheet({
  visible,
  onClose,
  title,
  items,
  theme,
  bottomInset,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  items: OptionSheetItem[];
  theme: ThemeTokens;
  bottomInset: number;
}) {
  const styles = useMemo(() => createOptionStyles(theme), [theme]);
  const renderRow = ({ item }: ListRenderItemInfo<OptionSheetItem>) => (
    <OptionRow item={item} theme={theme} styles={styles} />
  );
  return (
    <PickerSheet
      visible={visible}
      onClose={onClose}
      title={title}
      theme={theme}
      bottomInset={bottomInset}
      maxHeightRatio={0.7}
    >
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={renderRow}
      />
    </PickerSheet>
  );
}

function OptionRow({
  item,
  theme,
  styles,
}: {
  item: OptionSheetItem;
  theme: ThemeTokens;
  styles: OptionStyles;
}) {
  return (
    <View>
      {item.separatorBefore ? <View style={styles.separator} /> : null}
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={item.onSelect}
        accessibilityRole="button"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: item.selected }}
      >
        <Feather
          name="check"
          size={16}
          color={item.selected ? theme.colors.foreground : "transparent"}
        />
        {item.swatch ? (
          <View style={[styles.swatch, { backgroundColor: item.swatch }]} />
        ) : null}
        <Text style={styles.rowText} numberOfLines={1}>
          {item.label}
        </Text>
      </Pressable>
    </View>
  );
}

type OptionStyles = ReturnType<typeof createOptionStyles>;

function createOptionStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    list: {
      flexGrow: 0,
    },
    listContent: {
      paddingHorizontal: theme.spacing["2"],
      paddingBottom: theme.spacing["2"],
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing["3"],
      minHeight: 48,
      paddingHorizontal: theme.spacing["3"],
      borderRadius: theme.borderRadius.md,
    },
    rowPressed: {
      backgroundColor: theme.colors.accent,
    },
    swatch: {
      width: 10,
      height: 10,
      borderRadius: theme.borderRadius.full,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
      marginVertical: theme.spacing["1"],
      marginHorizontal: theme.spacing["3"],
    },
    rowText: {
      flex: 1,
      fontSize: theme.typography.fontSize.sm.size,
      color: theme.colors.foreground,
    },
  });
}
