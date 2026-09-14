import React from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { HeaderIconButton, SurfaceToolbar } from "../layout";
import { SurfaceAppSwitcherTitle } from "../SurfaceAppSwitcherTitle";

interface MailTopToolbarProps {
  onMenu: () => void;
  onCompose: () => void;
  onSearch?: () => void;
}

export function MailTopToolbar({
  onMenu,
  onCompose,
  onSearch,
}: MailTopToolbarProps) {
  return (
    <SurfaceToolbar
      bordered={false}
      leading={
        <HeaderIconButton
          name="menu"
          size={22}
          onPress={onMenu}
          accessibilityLabel="Open menu"
        />
      }
      center={<SurfaceAppSwitcherTitle activeApp="mail" />}
      trailing={
        <View style={styles.trailingGroup}>
          {onSearch ? (
            <HeaderIconButton
              name="search"
              size={20}
              onPress={onSearch}
              accessibilityLabel="Search mail"
            />
          ) : null}
          <HeaderIconButton
            name="edit-3"
            size={20}
            onPress={onCompose}
            accessibilityLabel="Compose message"
          />
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  trailingGroup: {
    flexDirection: "row",
    alignItems: "center",
  } as ViewStyle,
});
