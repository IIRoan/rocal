import React from "react";
import {
  LIST_DENSITY_OPTIONS,
  MAIL_AUTO_ADVANCE_OPTIONS,
  MAIL_SWIPE_ACTION_OPTIONS,
  MARK_AS_READ_DELAY_OPTIONS,
  UNDO_TOAST_DURATION_OPTIONS,
  type MailListSettings,
} from "@workspace/calendar-core";
import { SettingsPage } from "@workspace/native-core/components/settings/SettingsPage";
import {
  SheetCenteredState,
  SheetGroup,
  SheetItem,
  SheetScroll,
  SheetSection,
  SheetSwitchItem,
} from "@workspace/native-core/components/sheet/SheetSections";
import { useMailListSettings } from "../../../hooks/use-mail-list-settings";

const SWIPE_SECTIONS = [
  { key: "swipeRight", title: "Swipe right" },
  { key: "swipeLeft", title: "Swipe left" },
] as const satisfies readonly { key: keyof MailListSettings; title: string }[];

export function MailListSettingsContent() {
  const { settings, isLoaded, updateSettings } = useMailListSettings();

  if (!isLoaded) {
    return (
      <SettingsPage title="Message list">
        <SheetCenteredState loading message="Loading settings…" />
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title="Message list">
      <SheetScroll>
        <SheetSection
          title="Density"
          footer="Comfortable adds spacing and shows two lines of preview."
        >
          <SheetGroup>
            {LIST_DENSITY_OPTIONS.map((option) => {
              const active = settings.density === option.value;
              return (
                <SheetItem
                  key={option.value}
                  label={option.label}
                  checked={active}
                  onPress={() => updateSettings({ density: option.value })}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                />
              );
            })}
          </SheetGroup>
        </SheetSection>

        <SheetSection
          title="Mark as read"
          footer="When an opened message is marked as read."
        >
          <SheetGroup>
            {MARK_AS_READ_DELAY_OPTIONS.map((option) => {
              const active = settings.markAsReadDelay === option.value;
              return (
                <SheetItem
                  key={option.value}
                  label={option.label}
                  checked={active}
                  onPress={() =>
                    updateSettings({ markAsReadDelay: option.value })
                  }
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                />
              );
            })}
          </SheetGroup>
        </SheetSection>

        <SheetSection
          title="After archiving or deleting"
          footer="What the reader shows after the open message leaves the list."
        >
          <SheetGroup>
            {MAIL_AUTO_ADVANCE_OPTIONS.map((option) => {
              const active = settings.autoAdvance === option.value;
              return (
                <SheetItem
                  key={option.value}
                  label={option.label}
                  checked={active}
                  onPress={() => updateSettings({ autoAdvance: option.value })}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                />
              );
            })}
          </SheetGroup>
        </SheetSection>

        <SheetSection
          title="Undo window"
          footer="How long the Undo button stays after moving or trashing messages."
        >
          <SheetGroup>
            {UNDO_TOAST_DURATION_OPTIONS.map((option) => {
              const active = settings.undoToastDurationMs === option.value;
              return (
                <SheetItem
                  key={option.value}
                  label={option.label}
                  checked={active}
                  onPress={() =>
                    updateSettings({ undoToastDurationMs: option.value })
                  }
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                />
              );
            })}
          </SheetGroup>
        </SheetSection>

        {SWIPE_SECTIONS.map(({ key, title }) => (
          <SheetSection
            key={key}
            title={title}
            footer="Swipe a message in the list to run this action."
          >
            <SheetGroup>
              {MAIL_SWIPE_ACTION_OPTIONS.map((option) => {
                const active = settings[key] === option.value;
                return (
                  <SheetItem
                    key={option.value}
                    label={option.label}
                    checked={active}
                    onPress={() => updateSettings({ [key]: option.value })}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                  />
                );
              })}
            </SheetGroup>
          </SheetSection>
        ))}

        <SheetSection title="Conversations">
          <SheetGroup>
            <SheetSwitchItem
              label="Expand threads in list"
              detail="Show the other messages of a conversation under its row"
              value={settings.threadExpandInList}
              onValueChange={(value) =>
                updateSettings({ threadExpandInList: value })
              }
            />
            <SheetSwitchItem
              label="Show label chips"
              detail="Display labels on message rows"
              value={settings.showLabelChipsInList}
              onValueChange={(value) =>
                updateSettings({ showLabelChipsInList: value })
              }
            />
          </SheetGroup>
        </SheetSection>
      </SheetScroll>
    </SettingsPage>
  );
}
