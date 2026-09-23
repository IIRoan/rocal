import React, { Children, isValidElement, useMemo, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type AccessibilityRole,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "../../providers/ThemeProvider";
import { BottomSheetScrollView } from "../BottomSheet";
import { MAIL_ICON, useMailSkin, type MailSkin } from "../mail/mail-ui";
import { Switch } from "../ui/Switch";

type FeatherName = keyof typeof Feather.glyphMap;

const ROW_PADDING_X = 16;
const ROW_GAP = 12;
const GROUP_RADIUS = 16;

function useSheetListStyles() {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = useMemo(() => createStyles(theme, skin), [skin, theme]);
  return { theme, skin, styles };
}

/** Scrollable drawer page body with the shared section rhythm; ends above the home indicator. */
export function SheetScroll({ children }: { children: ReactNode }) {
  const { theme, styles } = useSheetListStyles();
  const insets = useSafeAreaInsets();
  const bottomPadding = useMemo(
    () => ({ paddingBottom: insets.bottom + theme.spacing["6"] }),
    [insets.bottom, theme.spacing],
  );
  return (
    <BottomSheetScrollView
      contentContainerStyle={[styles.content, bottomPadding]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </BottomSheetScrollView>
  );
}

/** Titled block of drawer content with an optional footnote. */
export function SheetSection({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  const { styles } = useSheetListStyles();
  return (
    <View style={styles.section}>
      {title ? (
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {children}
      {footer ? <Text style={styles.sectionFooter}>{footer}</Text> : null}
    </View>
  );
}

/** Where a row's label starts, so dividers line up under the text like Skiff's settings lists. */
function rowDividerInset(row: ReactNode): number {
  if (!isValidElement<Partial<SheetItemProps>>(row)) {
    return ROW_PADDING_X;
  }
  const { icon, swatch, leading } = row.props;
  if (icon || swatch || leading) {
    return ROW_PADDING_X + MAIL_ICON.sheet + ROW_GAP;
  }
  return ROW_PADDING_X;
}

/** Rounded field-colored group; draws inset hairline dividers between its rows. */
export function SheetGroup({ children }: { children: ReactNode }) {
  const { styles } = useSheetListStyles();
  const rows = Children.toArray(children);
  return (
    <View style={styles.group}>
      {rows.map((row, index) => (
        <View key={isValidElement(row) && row.key != null ? row.key : `row-${index}`}>
          {index > 0 ? (
            <View style={[styles.divider, { marginLeft: rowDividerInset(rows[index - 1]) }]} />
          ) : null}
          {row}
        </View>
      ))}
    </View>
  );
}

/** Padded, non-row content inside a group (pickers, previews). */
export function SheetGroupBlock({ children }: { children: ReactNode }) {
  const { styles } = useSheetListStyles();
  return <View style={styles.block}>{children}</View>;
}

export interface SheetItemProps {
  label: string;
  detail?: string;
  detailTone?: "muted" | "destructive";
  /** Current value shown right-aligned before the trailing slot, e.g. a picker's selection. */
  value?: string;
  icon?: FeatherName;
  /** Leading color chip, e.g. a calendar or label color. */
  swatch?: string;
  leading?: ReactNode;
  /** Accent-colored trailing icon; `checked` is shorthand for a check. */
  accessory?: FeatherName;
  checked?: boolean;
  trailing?: ReactNode;
  chevron?: boolean;
  tone?: "default" | "accent" | "destructive";
  pending?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: { selected?: boolean; checked?: boolean; disabled?: boolean };
}

/** One 48pt drawer row: leading icon or node, label with optional detail, trailing slot. */
export function SheetItem({
  label,
  detail,
  detailTone = "muted",
  value,
  icon,
  swatch,
  leading,
  accessory,
  checked = false,
  trailing,
  chevron = false,
  tone = "default",
  pending = false,
  disabled = false,
  onPress,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
}: SheetItemProps) {
  const { theme, skin, styles } = useSheetListStyles();
  const toneColor =
    tone === "accent"
      ? skin.accent
      : tone === "destructive"
        ? theme.colors.destructive
        : theme.colors.foreground;
  const iconColor = tone === "default" ? skin.textSecondary : toneColor;

  const trailingAccessory = checked ? "check" : accessory;
  const leadingIcon = swatch ? (
    <SheetSwatch color={swatch} />
  ) : icon ? (
    <View style={styles.iconSlot}>
      <Feather name={icon} size={MAIL_ICON.sheetAccessory} color={iconColor} />
    </View>
  ) : null;

  const body = (
    <>
      {leading ?? leadingIcon}
      <View style={styles.rowCopy}>
        <Text style={[styles.rowLabel, { color: toneColor }]} numberOfLines={1}>
          {label}
        </Text>
        {detail ? (
          <Text
            style={[styles.rowDetail, detailTone === "destructive" && styles.rowDetailDestructive]}
            numberOfLines={2}
          >
            {detail}
          </Text>
        ) : null}
      </View>
      {value && !pending ? (
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {pending ? (
        <ActivityIndicator size="small" color={skin.textSecondary} />
      ) : (
        trailing ?? (trailingAccessory ? <SheetAccessory icon={trailingAccessory} /> : null)
      )}
      {chevron && !pending ? (
        <Feather name="chevron-right" size={16} color={skin.textTertiary} />
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, disabled && styles.disabled]}>{body}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || pending}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.rowPressed,
        disabled && styles.disabled,
      ]}
      accessibilityRole={accessibilityRole ?? "button"}
      accessibilityLabel={
        accessibilityLabel ?? [label, value, detail].filter(Boolean).join(", ")
      }
      accessibilityState={{ disabled, ...accessibilityState }}
    >
      {body}
    </Pressable>
  );
}

/** Row with a trailing switch; the whole row toggles. */
export function SheetSwitchItem({
  label,
  detail,
  icon,
  value,
  onValueChange,
  disabled = false,
  pending = false,
}: {
  label: string;
  detail?: string;
  icon?: FeatherName;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  pending?: boolean;
}) {
  return (
    <SheetItem
      label={label}
      detail={detail}
      icon={icon}
      disabled={disabled}
      pending={pending}
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      trailing={<Switch value={value} />}
    />
  );
}

/** Accent-colored trailing icon, e.g. an add affordance. */
function SheetAccessory({ icon }: { icon: FeatherName }) {
  const { skin } = useSheetListStyles();
  return <Feather name={icon} size={MAIL_ICON.sheetAccessory} color={skin.accent} />;
}

/** Small rounded-square color chip, the Skiff calendar swatch. */
export function SheetSwatch({ color }: { color: string }) {
  const { styles } = useSheetListStyles();
  return (
    <View style={styles.iconSlot}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
    </View>
  );
}

/** Borderless text input sized like a row, for use inside a SheetGroup. */
export function SheetTextField(props: TextInputProps) {
  const { skin, styles } = useSheetListStyles();
  return (
    <TextInput
      placeholderTextColor={skin.textTertiary}
      {...props}
      style={[styles.field, props.style]}
    />
  );
}

/** Rounded search field with a leading magnifier, for filtering a drawer list. */
export function SheetSearchField({
  value,
  onChangeText,
  placeholder = "Search",
  accessibilityLabel,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  accessibilityLabel: string;
}) {
  const { skin, styles } = useSheetListStyles();
  return (
    <View style={styles.search}>
      <Feather name="search" size={16} color={skin.textTertiary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={skin.textTertiary}
        style={styles.searchInput}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="while-editing"
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}

/** Full-width drawer button: primary CTA pill, secondary field pill, or destructive text pill. */
export function SheetButton({
  label,
  onPress,
  variant = "primary",
  icon,
  pending = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "destructive";
  icon?: FeatherName;
  pending?: boolean;
  disabled?: boolean;
}) {
  const { theme, styles } = useSheetListStyles();
  const foreground =
    variant === "primary"
      ? theme.colors.primaryForeground
      : variant === "destructive"
        ? theme.colors.destructive
        : theme.colors.foreground;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || pending}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" ? styles.buttonPrimary : styles.buttonSecondary,
        pressed && styles.buttonPressed,
        (disabled || pending) && styles.disabled,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || pending, busy: pending }}
    >
      {pending ? (
        <ActivityIndicator size="small" color={foreground} />
      ) : (
        <>
          {icon ? <Feather name={icon} size={16} color={foreground} /> : null}
          <Text style={[styles.buttonLabel, { color: foreground }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Inline message under a form: muted hint or destructive error. */
export function SheetMessage({
  text,
  tone = "muted",
}: {
  text: string;
  tone?: "muted" | "destructive";
}) {
  const { styles } = useSheetListStyles();
  return (
    <Text style={[styles.message, tone === "destructive" && styles.messageDestructive]}>
      {text}
    </Text>
  );
}

/** Centered loading or error state that fills a drawer page. */
export function SheetCenteredState({
  message,
  loading = false,
  tone = "muted",
}: {
  message: string;
  loading?: boolean;
  tone?: "muted" | "destructive";
}) {
  const { skin, styles } = useSheetListStyles();
  return (
    <View style={styles.centered}>
      {loading ? <ActivityIndicator color={skin.textSecondary} /> : null}
      <Text style={[styles.message, styles.messageCentered, tone === "destructive" && styles.messageDestructive]}>
        {message}
      </Text>
    </View>
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const view = {
    content: {
      paddingHorizontal: theme.spacing["4"],
      paddingTop: theme.spacing["3"],
      gap: theme.spacing["6"],
    },
    section: {
      gap: 6,
    },
    group: {
      borderRadius: GROUP_RADIUS,
      backgroundColor: skin.field,
      overflow: "hidden" as const,
      paddingVertical: theme.spacing["1"],
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: skin.borderPrimary,
    },
    block: {
      paddingHorizontal: ROW_PADDING_X,
      paddingVertical: theme.spacing["3"],
    },
    row: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: ROW_GAP,
      minHeight: 48,
      paddingHorizontal: ROW_PADDING_X,
      paddingVertical: theme.spacing["2"],
    },
    search: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing["2"],
      height: 40,
      paddingHorizontal: theme.spacing["3"],
      borderRadius: theme.borderRadius.xl,
      backgroundColor: skin.field,
    },
    rowPressed: {
      backgroundColor: skin.selected,
    },
    rowCopy: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    iconSlot: {
      width: MAIL_ICON.sheet,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    swatch: {
      width: 14,
      height: 14,
      borderRadius: 4,
    },
    disabled: {
      opacity: 0.45,
    },
    button: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: theme.spacing["2"],
      minHeight: 48,
      paddingHorizontal: theme.spacing["4"],
      borderRadius: theme.borderRadius.full,
    },
    buttonPrimary: {
      backgroundColor: theme.colors.primaryBase,
    },
    buttonSecondary: {
      backgroundColor: skin.field,
    },
    buttonPressed: {
      opacity: 0.75,
    },
    centered: {
      flex: 1,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: theme.spacing["3"],
      padding: theme.spacing["6"],
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    sectionTitle: {
      paddingHorizontal: theme.spacing["1"],
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "600" as TextStyle["fontWeight"],
      letterSpacing: 0.6,
      textTransform: "uppercase" as const,
      color: skin.textTertiary,
    },
    sectionFooter: {
      paddingHorizontal: theme.spacing["1"],
      fontSize: 13,
      lineHeight: 18,
      color: skin.textTertiary,
    },
    rowLabel: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: "500" as TextStyle["fontWeight"],
    },
    rowValue: {
      flexShrink: 1,
      maxWidth: "50%",
      fontSize: 15,
      lineHeight: 20,
      color: skin.textSecondary,
    },
    rowDetail: {
      ...skin.meta,
    },
    rowDetailDestructive: {
      color: theme.colors.destructive,
    },
    field: {
      minHeight: 48,
      paddingHorizontal: theme.spacing["4"],
      paddingVertical: theme.spacing["3"],
      fontSize: 15,
      lineHeight: 20,
      color: theme.colors.foreground,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      paddingVertical: 0,
      color: theme.colors.foreground,
    },
    buttonLabel: {
      fontSize: 16,
      lineHeight: 21,
      fontWeight: "600" as TextStyle["fontWeight"],
    },
    message: {
      paddingHorizontal: theme.spacing["1"],
      fontSize: 13,
      lineHeight: 18,
      color: skin.textTertiary,
    },
    messageCentered: {
      textAlign: "center" as const,
    },
    messageDestructive: {
      color: theme.colors.destructive,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
