import React, { useState } from "react";
import { Alert } from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  getErrorMessage,
  type Calendar,
  type CalendarSubscription,
} from "@workspace/calendar-core";
import { useTheme } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import {
  useCalendarSubscriptions,
  useCalendars,
  useDeleteSubscription,
  useSyncSubscription,
  useUpdateSubscription,
} from "../../hooks/use-calendar-management";
import { useToggleCalendarVisibility } from "../../hooks/use-toggle-calendar-visibility";
import { resolveCalendarSwatchColor } from "../../lib/calendar-color-utils";
import {
  formatLastSync,
  getSubscriptionType,
  isNamedCalendarColor,
  validateEditableSubscriptionInput,
  type SubscriptionFieldErrors,
} from "../../lib/subscription-utils";
import { ColorPicker } from "../event/ColorPicker";
import { useSheetPageNavigator } from "../sheet/SheetPageStack";
import {
  SheetButton,
  SheetCenteredState,
  SheetGroup,
  SheetGroupBlock,
  SheetMessage,
  SheetItem,
  SheetScroll,
  SheetSection,
  SheetSwitchItem,
  SheetTextField,
} from "../sheet/SheetSections";

export function SubscriptionEditPage({ id }: { id: string }) {
  const subscriptionsQuery = useCalendarSubscriptions();
  const { data: calendars } = useCalendars();
  const subscription = subscriptionsQuery.data?.find((entry) => entry.id === id);

  if (subscriptionsQuery.isLoading) {
    return <SheetCenteredState loading message="Loading calendar…" />;
  }
  if (subscriptionsQuery.isError) {
    return (
      <SheetCenteredState
        tone="destructive"
        message={getErrorMessage(subscriptionsQuery.error, "Failed to load calendar")}
      />
    );
  }
  if (!subscription) {
    return <SheetCenteredState tone="destructive" message="Read-only calendar not found." />;
  }
  return (
    <SubscriptionEditForm
      subscription={subscription}
      calendar={calendars?.find((entry) => entry.id === subscription.calendar.id)}
    />
  );
}

function SubscriptionEditForm({
  subscription,
  calendar,
}: {
  subscription: CalendarSubscription;
  calendar: Calendar | undefined;
}) {
  const { theme } = useTheme();
  const { toast } = useToast();
  const { back } = useSheetPageNavigator();
  const updateSubscription = useUpdateSubscription(subscription.id);
  const deleteSubscription = useDeleteSubscription(subscription.id);
  const syncSubscription = useSyncSubscription();
  const { toggle, pendingCalendarId } = useToggleCalendarVisibility();

  const [name, setName] = useState(subscription.calendar.name);
  const [color, setColor] = useState<string>(subscription.calendar.color || "indigo");
  const [fieldErrors, setFieldErrors] = useState<SubscriptionFieldErrors>({});

  const isHoliday = getSubscriptionType(subscription) === "holiday";
  const lastSynced = `Last synced ${formatLastSync(subscription.lastSyncAt).toLowerCase()}`;

  const handleSave = () => {
    const errors = validateEditableSubscriptionInput({ name, color });
    setFieldErrors(errors);
    if (errors.name || errors.color) return;
    updateSubscription.mutate({ name: name.trim(), color: color.trim() }, { onSuccess: back });
  };

  const confirmRemove = () => {
    Alert.alert(
      `Remove ${subscription.calendar.name}?`,
      "Its synced events will be deleted from this account.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => deleteSubscription.mutate(undefined, { onSuccess: back }),
        },
      ],
    );
  };

  const handleCopySource = async () => {
    await Clipboard.setStringAsync(subscription.url);
    toast("Source URL copied");
  };

  return (
    <SheetScroll>
      <SheetSection title="Name">
        <SheetGroup>
          <SheetTextField
            value={name}
            onChangeText={(value) => {
              setName(value);
              setFieldErrors((previous) => ({ ...previous, name: undefined }));
            }}
            placeholder="Calendar name"
            accessibilityLabel="Calendar name"
          />
        </SheetGroup>
        {fieldErrors.name ? <SheetMessage tone="destructive" text={fieldErrors.name} /> : null}
      </SheetSection>

      <SheetSection title="Color">
        <SheetGroup>
          {!isNamedCalendarColor(color) ? (
            <SheetItem
              key="custom"
              label="Current custom color"
              swatch={resolveCalendarSwatchColor(color, theme)}
            />
          ) : null}
          <SheetGroupBlock key="picker">
            <ColorPicker
              selectedColor={isNamedCalendarColor(color) ? color : undefined}
              onColorSelect={(nextColor) => {
                setColor(nextColor);
                setFieldErrors((previous) => ({ ...previous, color: undefined }));
              }}
            />
          </SheetGroupBlock>
        </SheetGroup>
        {fieldErrors.color ? <SheetMessage tone="destructive" text={fieldErrors.color} /> : null}
      </SheetSection>

      <SheetSection footer="Hidden calendars keep syncing but stay out of your calendar views.">
        <SheetGroup>
          <SheetSwitchItem
            label="Show in calendar"
            icon="eye"
            value={calendar?.isVisible ?? true}
            onValueChange={() => {
              if (calendar) toggle(calendar);
            }}
            disabled={!calendar || pendingCalendarId === calendar.id}
          />
        </SheetGroup>
      </SheetSection>

      <SheetButton
        label="Save changes"
        onPress={handleSave}
        pending={updateSubscription.isPending}
      />

      <SheetSection title="Sync">
        <SheetGroup>
          {isHoliday ? (
            <SheetItem label="Refreshes automatically" detail={lastSynced} icon="refresh-cw" />
          ) : (
            <SheetItem
              label="Sync now"
              detail={lastSynced}
              icon="refresh-cw"
              pending={syncSubscription.isPending}
              onPress={() => syncSubscription.mutate(subscription.id)}
            />
          )}
        </SheetGroup>
        {subscription.lastErrorMessage ? (
          <SheetMessage tone="destructive" text={subscription.lastErrorMessage} />
        ) : null}
      </SheetSection>

      <SheetSection title="Source">
        <SheetGroup>
          <SheetItem
            label="Copy source URL"
            detail={subscription.url}
            icon="copy"
            onPress={() => void handleCopySource()}
          />
        </SheetGroup>
      </SheetSection>

      <SheetSection footer="Synced events are deleted from this account.">
        <SheetGroup>
          <SheetItem
            label="Remove calendar"
            icon="trash-2"
            tone="destructive"
            pending={deleteSubscription.isPending}
            onPress={confirmRemove}
          />
        </SheetGroup>
      </SheetSection>
    </SheetScroll>
  );
}
