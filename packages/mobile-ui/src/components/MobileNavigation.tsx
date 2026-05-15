import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/calendar", label: "Calendar" },
  { href: "/tasks", label: "Tasks" },
  { href: "/settings", label: "Settings" },
];

export const MobileNavigation = () => {
  return (
    <View>
      {links.map((link) => (
        <TouchableOpacity key={link.href} style={styles.link}>
          <Text style={styles.linkText}>{link.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  link: {
    paddingVertical: 10,
  },
  linkText: {
    fontSize: 18,
  },
});
