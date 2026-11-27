import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import type { MailEditorFormat, MailEditorFormatState } from "@workspace/mail-editor/protocol";
import type { ThemeTokens } from "@workspace/design-tokens";
import { useTheme } from "@workspace/native-core/providers/ThemeProvider";
import { MAIL_LAYOUT, useMailSkin, type MailSkin } from "@workspace/native-core/components/mail/mail-ui";
import {
  COMPOSE_FORMAT_BAR_GAP,
  COMPOSE_FORMAT_BAR_HEIGHT,
} from "../../lib/mail/compose-display";
import { useAfterPaintProgress } from "../../hooks/use-after-paint-progress";

type FeatherName = keyof typeof Feather.glyphMap;
type Glyph = { glyph: string; glyphStyle?: "bold" | "italic" | "underline" | "strike" | "large" };

type Tool = {
  key: string;
  label: string;
  /** Formatting runs on press-in so the editor keeps its caret and selection. */
  pressIn?: boolean;
  active?: boolean;
  onPress: () => void;
} & (Glyph | { icon: FeatherName });

type Separator = { key: string; separator: true };

const PAD = (COMPOSE_FORMAT_BAR_HEIGHT - MAIL_LAYOUT.hitSize) / 2;
const PANEL_HEIGHT = COMPOSE_FORMAT_BAR_HEIGHT + MAIL_LAYOUT.hitSize;
/** Eight tools fit a 375pt phone at this size; the hit slop keeps each one a 44pt target. */
const TOOL_SIZE = 40;
const TOOL_HIT_SLOP = (MAIL_LAYOUT.hitSize - TOOL_SIZE) / 2;
const OPEN_MS = 220;
const CLOSE_MS = 140;

type ComposeFormatBarProps = {
  /** Whether the bar is on screen; it folds back to one row when it leaves. */
  active: boolean;
  /** Plain-text compose sends no HTML, so the formatting buttons are hidden. */
  plainTextMode?: boolean;
  formatState: MailEditorFormatState;
  onFormat: (format: MailEditorFormat) => void;
  onLink: () => void;
  onInsertPhoto: () => void;
  onAttach: () => void;
  onChooseSignature: () => void;
  onInsertTemplate: () => void;
  /** Absent when the mail server can't hold messages. */
  onSchedule?: () => void;
};

/** The floating format pill; "More" grows a second row in place, above the first. */
export function ComposeFormatBar({
  active,
  plainTextMode = false,
  formatState,
  onFormat,
  onLink,
  onInsertPhoto,
  onAttach,
  onChooseSignature,
  onInsertTemplate,
  onSchedule,
}: ComposeFormatBarProps) {
  const { theme } = useTheme();
  const skin = useMailSkin();
  const styles = createStyles(theme, skin);
  const [expanded, setExpanded] = useState(false);
  if (expanded && (!active || plainTextMode)) setExpanded(false);
  const motion = usePanelMotion(expanded);

  const format = (key: MailEditorFormat, label: string, look: Glyph | { icon: FeatherName }, on: boolean): Tool => ({
    key,
    label,
    pressIn: true,
    active: on,
    onPress: () => onFormat(key),
    ...look,
  });
  // Pickers open a drawer, so the pill folds back behind them.
  const closing = (tool: Tool): Tool => ({ ...tool, onPress: () => { setExpanded(false); tool.onPress(); } });
  const insertTools: Tool[] = [
    closing({ key: "signature", label: "Signature", icon: "edit-3", onPress: onChooseSignature }),
    closing({ key: "template", label: "Insert template", icon: "file-text", onPress: onInsertTemplate }),
    ...(onSchedule ? [closing({ key: "schedule", label: "Schedule send", icon: "clock", onPress: onSchedule })] : []),
  ];
  const attach: Tool = { key: "attach", label: "Attach file", icon: "paperclip", onPress: onAttach };
  const firstRow: (Tool | Separator)[] = plainTextMode
    ? [attach, ...insertTools]
    : [
        format("bold", "Bold", { glyph: "B", glyphStyle: "bold" }, formatState.bold),
        format("italic", "Italic", { glyph: "I", glyphStyle: "italic" }, formatState.italic),
        format("underline", "Underline", { glyph: "U", glyphStyle: "underline" }, formatState.underline),
        { key: "after-marks", separator: true },
        format("bulletList", "Bulleted list", { icon: "list" }, formatState.bulletList),
        { key: "link", label: formatState.link ? "Edit link" : "Add link", icon: "link", active: Boolean(formatState.link), onPress: onLink },
        { key: "before-media", separator: true },
        { key: "photo", label: "Insert photo", icon: "image", onPress: onInsertPhoto },
        attach,
        { key: "before-more", separator: true },
        { key: "more", label: expanded ? "Fewer tools" : "More tools", icon: "more-horizontal", active: expanded, onPress: () => setExpanded(!expanded) },
      ];
  const secondRow: (Tool | Separator)[] = [
    format("strike", "Strikethrough", { glyph: "S", glyphStyle: "strike" }, formatState.strike),
    format("orderedList", "Numbered list", { glyph: "1." }, formatState.orderedList),
    format("blockquote", "Quote", { glyph: "“", glyphStyle: "large" }, formatState.blockquote),
    format("clearFormatting", "Clear formatting", { icon: "x-circle" }, false),
    { key: "before-inserts", separator: true },
    ...insertTools,
  ];

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Animated.View style={[styles.panel, motion.panelStyle]} pointerEvents="none" />
      {plainTextMode ? null : (
        <Animated.View
          style={[styles.row, styles.secondRow, motion.rowStyle]}
          pointerEvents={expanded ? "auto" : "none"}
          accessibilityElementsHidden={!expanded}
          importantForAccessibility={expanded ? "auto" : "no-hide-descendants"}
        >
          <ToolRow tools={secondRow} styles={styles} color={theme.colors.foreground} />
        </Animated.View>
      )}
      <View style={styles.pill}>
        <Animated.View style={[styles.pillSurface, motion.pillStyle]} pointerEvents="none" />
        <View style={styles.row}>
          <ToolRow tools={firstRow} styles={styles} color={theme.colors.foreground} expanded={expanded} />
        </View>
      </View>
    </View>
  );
}

/** The panel rises in after it has painted; the second row follows it in and leaves first. */
function usePanelMotion(expanded: boolean) {
  const progress = useAfterPaintProgress(expanded, OPEN_MS, CLOSE_MS);
  return {
    panelStyle: useAnimatedStyle(() => ({
      opacity: progress.get(),
      transform: [{ translateY: (1 - progress.get()) * 8 }, { scale: 0.98 + 0.02 * progress.get() }],
    })),
    rowStyle: useAnimatedStyle(() => {
      const shown = Math.min(1, Math.max(0, (progress.get() - 0.35) / 0.65));
      return { opacity: shown, transform: [{ translateY: (1 - shown) * 6 }] };
    }),
    pillStyle: useAnimatedStyle(() => ({ opacity: 1 - progress.get() })),
  };
}

function ToolRow({
  tools,
  styles,
  color,
  expanded,
}: {
  tools: (Tool | Separator)[];
  styles: ReturnType<typeof createStyles>;
  color: string;
  expanded?: boolean;
}) {
  const glyphStyles = {
    bold: styles.glyphBold,
    italic: styles.glyphItalic,
    underline: styles.glyphUnderline,
    strike: styles.glyphStrike,
    large: styles.glyphLarge,
  };
  return tools.map((tool) =>
    "separator" in tool ? (
      <View key={tool.key} style={styles.separator} />
    ) : (
      <Pressable
        key={tool.key}
        onPress={tool.pressIn ? undefined : tool.onPress}
        onPressIn={tool.pressIn ? tool.onPress : undefined}
        accessibilityRole="button"
        accessibilityLabel={tool.label}
        accessibilityState={tool.key === "more" ? { expanded } : { selected: Boolean(tool.active) }}
        hitSlop={TOOL_HIT_SLOP}
        style={({ pressed }) => [styles.tool, (pressed || tool.active) && styles.toolOn]}
      >
        {"icon" in tool ? (
          <Feather name={tool.icon} size={17} color={color} />
        ) : (
          <Text style={[styles.glyph, tool.glyphStyle ? glyphStyles[tool.glyphStyle] : null]}>{tool.glyph}</Text>
        )}
      </Pressable>
    ),
  );
}

function createStyles(theme: ThemeTokens, skin: MailSkin) {
  const surface = {
    backgroundColor: theme.colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: skin.borderPrimary,
    ...(theme.shadows.xs ? { boxShadow: [theme.shadows.xs] } : null),
  };
  const view = {
    wrap: {
      height: PANEL_HEIGHT,
      marginHorizontal: COMPOSE_FORMAT_BAR_GAP,
      marginBottom: COMPOSE_FORMAT_BAR_GAP,
    },
    panel: {
      ...surface,
      position: "absolute" as const,
      left: 0,
      right: 0,
      bottom: 0,
      height: PANEL_HEIGHT,
      borderRadius: COMPOSE_FORMAT_BAR_HEIGHT / 2,
      transformOrigin: "bottom",
    },
    pill: {
      position: "absolute" as const,
      left: 0,
      right: 0,
      bottom: 0,
      height: COMPOSE_FORMAT_BAR_HEIGHT,
    },
    pillSurface: {
      ...surface,
      position: "absolute" as const,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      borderRadius: COMPOSE_FORMAT_BAR_HEIGHT / 2,
    },
    row: {
      flex: 1,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-around" as const,
      paddingHorizontal: PAD,
    },
    secondRow: {
      position: "absolute" as const,
      left: 0,
      right: 0,
      top: PAD,
      height: MAIL_LAYOUT.hitSize,
    },
    tool: {
      width: TOOL_SIZE,
      height: TOOL_SIZE,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderRadius: TOOL_SIZE / 2,
    },
    toolOn: {
      backgroundColor: skin.pressed,
    },
    separator: {
      width: StyleSheet.hairlineWidth,
      height: 22,
      backgroundColor: skin.borderPrimary,
    },
  } satisfies Record<string, ViewStyle>;

  const text = {
    glyph: {
      fontSize: skin.body.fontSize,
      fontWeight: "500" as TextStyle["fontWeight"],
      color: theme.colors.foreground,
    },
    glyphBold: {
      fontWeight: "700" as TextStyle["fontWeight"],
    },
    glyphItalic: {
      fontStyle: "italic" as const,
    },
    glyphUnderline: {
      textDecorationLine: "underline" as const,
    },
    glyphStrike: {
      textDecorationLine: "line-through" as const,
    },
    glyphLarge: {
      fontSize: 22,
    },
  } satisfies Record<string, TextStyle>;

  return { ...StyleSheet.create(view), ...StyleSheet.create(text) };
}
