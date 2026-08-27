import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  type TextStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import type { ThemeTokens } from "@workspace/design-tokens";
import { BlobatarAvatar } from "../BlobatarAvatar";

export type SettingsFeatherIcon = React.ComponentProps<typeof Feather>["name"];

export function SettingsSectionLabel({
  text,
  theme,
  isFirst = true,
}: {
  text: string;
  theme: ThemeTokens;
  isFirst?: boolean;
}) {
  return (
    <View
      style={{
        paddingHorizontal: theme.spacing["4"],
        paddingTop: isFirst ? theme.spacing["3"] : theme.spacing["2"],
        paddingBottom: theme.spacing["1"],
        ...(isFirst
          ? {}
          : {
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: theme.colors.border,
              marginTop: theme.spacing["2"],
            }),
      }}
    >
      <Text
        style={{
          fontSize: theme.typography.fontSize.xs.size,
          lineHeight: theme.typography.fontSize.xs.lineHeight,
          fontWeight: theme.typography.fontWeight
            .medium as TextStyle["fontWeight"],
          color: theme.colors.mutedForeground,
        }}
        accessibilityRole="header"
      >
        {text}
      </Text>
    </View>
  );
}

export function SettingsHintRow({
  text,
  theme,
}: {
  text: string;
  theme: ThemeTokens;
}) {
  return (
    <View
      style={{
        paddingHorizontal: theme.spacing["3"],
        paddingVertical: theme.spacing["2"],
      }}
    >
      <Text
        style={{
          fontSize: theme.typography.fontSize.xs.size,
          lineHeight: theme.typography.fontSize.xs.lineHeight,
          color: theme.colors.mutedForeground,
        }}
      >
        {text}
      </Text>
    </View>
  );
}

function settingsRowStyle(
  theme: ThemeTokens,
  pressed: boolean,
): Record<string, unknown> {
  return {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.spacing["3"],
    paddingHorizontal: theme.spacing["3"],
    paddingVertical: theme.spacing["3"],
    minHeight: 48,
    borderRadius: theme.borderRadius.md,
    marginHorizontal: theme.spacing["1"],
    backgroundColor: pressed ? theme.colors.accent : "transparent",
  };
}

export function SettingsNavigationRow({
  icon,
  label,
  value,
  onPress,
  theme,
  isPending,
}: {
  icon: SettingsFeatherIcon;
  label: string;
  value?: string;
  onPress: () => void;
  theme: ThemeTokens;
  isPending?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => settingsRowStyle(theme, pressed)}
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
    >
      <Feather name={icon} size={16} color={theme.colors.mutedForeground} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: theme.typography.fontSize.sm.size,
            lineHeight: theme.typography.fontSize.sm.lineHeight,
            color: theme.colors.foreground,
          }}
        >
          {label}
        </Text>
        {value ? (
          <Text
            style={{
              fontSize: theme.typography.fontSize.xs.size,
              lineHeight: theme.typography.fontSize.xs.lineHeight,
              color: theme.colors.mutedForeground,
            }}
            numberOfLines={1}
          >
            {value}
          </Text>
        ) : null}
      </View>
      {isPending ? (
        <ActivityIndicator size="small" />
      ) : (
        <Feather
          name="chevron-right"
          size={14}
          color={theme.colors.mutedForeground}
          style={{ opacity: 0.4 }}
        />
      )}
    </Pressable>
  );
}

export function SettingsPickerRow({
  icon,
  label,
  value,
  onPress,
  theme,
  isPending,
}: {
  icon: SettingsFeatherIcon;
  label: string;
  value: string;
  onPress: () => void;
  theme: ThemeTokens;
  isPending?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => settingsRowStyle(theme, pressed)}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      <Feather name={icon} size={16} color={theme.colors.mutedForeground} />
      <Text
        style={{
          flex: 1,
          fontSize: theme.typography.fontSize.sm.size,
          lineHeight: theme.typography.fontSize.sm.lineHeight,
          color: theme.colors.foreground,
        }}
      >
        {label}
      </Text>
      {isPending ? (
        <ActivityIndicator size="small" />
      ) : (
        <>
          <Text
            style={{
              fontSize: theme.typography.fontSize.sm.size,
              lineHeight: theme.typography.fontSize.sm.lineHeight,
              color: theme.colors.mutedForeground,
            }}
            numberOfLines={1}
          >
            {value}
          </Text>
          <Feather
            name="chevron-right"
            size={14}
            color={theme.colors.mutedForeground}
            style={{ opacity: 0.4 }}
          />
        </>
      )}
    </Pressable>
  );
}

export function SettingsToggleRow({
  icon,
  label,
  description,
  value,
  onValueChange,
  theme,
}: {
  icon: SettingsFeatherIcon;
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  theme: ThemeTokens;
}) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => settingsRowStyle(theme, pressed)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
    >
      <Feather
        name={icon}
        size={16}
        color={theme.colors.mutedForeground}
        style={{ marginTop: 2 }}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: theme.typography.fontSize.sm.size,
            lineHeight: theme.typography.fontSize.sm.lineHeight,
            color: theme.colors.foreground,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: theme.typography.fontSize.xs.size,
            lineHeight: theme.typography.fontSize.xs.lineHeight,
            color: theme.colors.mutedForeground,
          }}
        >
          {description}
        </Text>
      </View>
      <Switch
        value={value}
        pointerEvents="none"
        trackColor={{
          false: theme.colors.input,
          true: theme.colors.primaryBase,
        }}
        thumbColor="#ffffff"
        style={{ transform: [{ scale: 0.85 }] }}
      />
    </Pressable>
  );
}

export function SettingsActionRow({
  icon,
  label,
  description,
  onPress,
  theme,
  destructive = false,
  isPending = false,
}: {
  icon: SettingsFeatherIcon;
  label: string;
  description: string;
  onPress: () => void;
  theme: ThemeTokens;
  destructive?: boolean;
  isPending?: boolean;
}) {
  const foregroundColor = destructive
    ? theme.colors.destructive
    : theme.colors.foreground;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => settingsRowStyle(theme, pressed)}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Feather name={icon} size={16} color={foregroundColor} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: theme.typography.fontSize.sm.size,
            lineHeight: theme.typography.fontSize.sm.lineHeight,
            color: foregroundColor,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontSize: theme.typography.fontSize.xs.size,
            lineHeight: theme.typography.fontSize.xs.lineHeight,
            color: theme.colors.mutedForeground,
          }}
        >
          {description}
        </Text>
      </View>
      {isPending ? (
        <ActivityIndicator size="small" color={foregroundColor} />
      ) : (
        <Feather
          name="chevron-right"
          size={14}
          color={theme.colors.mutedForeground}
        />
      )}
    </Pressable>
  );
}

export function SettingsSheetOption({
  icon,
  label,
  isSelected,
  onPress,
  theme,
  multiSelect = false,
}: {
  icon?: SettingsFeatherIcon;
  label: string;
  isSelected: boolean;
  onPress: () => void;
  theme: ThemeTokens;
  multiSelect?: boolean;
}) {
  const activeColor = theme.colors.primaryBase;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: theme.spacing["4"],
          paddingHorizontal: 20,
          minHeight: 52,
          paddingVertical: theme.spacing["3"],
          backgroundColor: isSelected ? activeColor + "14" : "transparent",
        },
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole={multiSelect ? "switch" : "menuitem"}
      accessibilityState={
        multiSelect ? { checked: isSelected } : { selected: isSelected }
      }
      accessibilityLabel={label}
    >
      {icon ? (
        <Feather
          name={icon}
          size={18}
          color={isSelected ? activeColor : theme.colors.mutedForeground}
        />
      ) : null}
      <Text
        style={{
          flex: 1,
          fontSize: theme.typography.fontSize.base.size,
          lineHeight: theme.typography.fontSize.base.lineHeight,
          color: isSelected ? activeColor : theme.colors.foreground,
          fontWeight: (isSelected ? "600" : "400") as TextStyle["fontWeight"],
        }}
      >
        {label}
      </Text>
      {isSelected ? <Feather name="check" size={16} color={activeColor} /> : null}
    </Pressable>
  );
}

export function SettingsAccountCard({
  name,
  email,
  imageUrl,
  theme,
  onPress,
}: {
  name?: string | null;
  email?: string | null;
  imageUrl?: string | null;
  theme: ThemeTokens;
  onPress?: () => void;
}) {
  const displayName = name?.trim() || null;
  const displayEmail = email?.trim() || null;
  const title = displayName ?? displayEmail ?? "Solace account";
  const body = (
    <>
      <BlobatarAvatar
        email={email}
        name={name}
        src={imageUrl}
        size={44}
      />
      <View style={{ flex: 1, minWidth: 0, justifyContent: "center" }}>
        <Text
          style={{
            fontSize: theme.typography.fontSize.sm.size,
            lineHeight: theme.typography.fontSize.sm.lineHeight,
            color: theme.colors.foreground,
            fontWeight: theme.typography.fontWeight
              .medium as TextStyle["fontWeight"],
          }}
          numberOfLines={1}
        >
          {title}
        </Text>
        {displayEmail ? (
          <Text
            style={{
              marginTop: 2,
              fontSize: theme.typography.fontSize.xs.size,
              lineHeight: theme.typography.fontSize.xs.lineHeight,
              color: theme.colors.mutedForeground,
            }}
            numberOfLines={1}
          >
            {displayEmail}
          </Text>
        ) : null}
      </View>
      {onPress ? (
        <Feather
          name="chevron-right"
          size={14}
          color={theme.colors.mutedForeground}
          style={{ opacity: 0.4 }}
        />
      ) : null}
    </>
  );

  const cardStyle = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.spacing["3"],
    paddingHorizontal: theme.spacing["3"],
    paddingVertical: theme.spacing["3"],
    marginHorizontal: theme.spacing["1"],
    marginBottom: theme.spacing["1"],
    borderRadius: theme.borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.muted + "30",
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          cardStyle,
          pressed && { backgroundColor: theme.colors.accent },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${title}. Open account settings.`}
      >
        {body}
      </Pressable>
    );
  }

  return <View style={cardStyle}>{body}</View>;
}
