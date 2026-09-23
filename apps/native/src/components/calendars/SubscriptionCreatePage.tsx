import React, { useMemo, useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { getErrorMessage, partitionCalendarsByKind } from "@workspace/calendar-core";
import {
  NATIONAL_HOLIDAY_CALENDARS,
  SUBSCRIPTION_FEED_URL_HELP_TEXT,
} from "@workspace/calendar-ics";
import { useTheme } from "../../providers/ThemeProvider";
import { useToast } from "../../providers/ToastProvider";
import {
  useCalendarSubscriptions,
  useCalendars,
  useCreateSubscription,
  useImportIcs,
} from "../../hooks/use-calendar-management";
import { resolveCalendarSwatchColor } from "../../lib/calendar-color-utils";
import {
  isNamedCalendarColor,
  normalizeSubscriptionUrl,
  validateCreateSubscriptionInput,
  type SubscriptionFieldErrors,
} from "../../lib/subscription-utils";
import { ColorPicker } from "../event/ColorPicker";
import { useSheetPageNavigator } from "../sheet/SheetPageStack";
import {
  SheetButton,
  SheetGroup,
  SheetGroupBlock,
  SheetMessage,
  SheetItem,
  SheetScroll,
  SheetSection,
  SheetTextField,
} from "../sheet/SheetSections";

type HolidayCalendar = (typeof NATIONAL_HOLIDAY_CALENDARS)[number];

type PickedIcsFile = {
  name: string;
  content: string;
};

export function SubscriptionCreatePage() {
  const { theme } = useTheme();
  const { toast } = useToast();
  const { back } = useSheetPageNavigator();
  const { data: calendars = [] } = useCalendars();
  const { data: subscriptions = [] } = useCalendarSubscriptions();
  const createSubscription = useCreateSubscription();
  const importIcs = useImportIcs();

  const [feedName, setFeedName] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [feedColor, setFeedColor] = useState<string>("indigo");
  const [feedErrors, setFeedErrors] = useState<SubscriptionFieldErrors>({});
  const [pickedFile, setPickedFile] = useState<PickedIcsFile | null>(null);
  const [importCalendarId, setImportCalendarId] = useState<string>();
  const [holidaySearch, setHolidaySearch] = useState("");

  const { ownedCalendars } = useMemo(() => partitionCalendarsByKind(calendars), [calendars]);
  const selectedImportCalendarId =
    importCalendarId ??
    (ownedCalendars.find((calendar) => calendar.isDefault) ?? ownedCalendars[0])?.id;

  const subscribedUrls = useMemo(
    () => new Set(subscriptions.map((subscription) => normalizeSubscriptionUrl(subscription.url))),
    [subscriptions],
  );

  const filteredHolidays = useMemo(() => {
    const search = holidaySearch.trim().toLowerCase();
    if (!search) return NATIONAL_HOLIDAY_CALENDARS;
    return NATIONAL_HOLIDAY_CALENDARS.filter((holiday) =>
      [holiday.label, holiday.countryName, holiday.language]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }, [holidaySearch]);

  const pendingSubscriptionUrl = createSubscription.isPending
    ? createSubscription.variables?.url
    : undefined;

  const handleAddFeed = () => {
    const errors = validateCreateSubscriptionInput({
      name: feedName,
      url: feedUrl,
      color: feedColor,
    });
    setFeedErrors(errors);
    if (errors.name || errors.url || errors.color) return;

    createSubscription.mutate(
      { name: feedName.trim(), url: normalizeSubscriptionUrl(feedUrl), color: feedColor.trim() },
      { onSuccess: back },
    );
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset || !asset.name.toLowerCase().endsWith(".ics")) {
        toast("Choose a .ics calendar file to import", "error");
        return;
      }
      setPickedFile({ name: asset.name, content: await new File(asset.uri).text() });
    } catch (error) {
      toast(getErrorMessage(error, "Failed to read the selected file"), "error");
    }
  };

  const handleImport = () => {
    if (!pickedFile || !selectedImportCalendarId) return;
    importIcs.mutate(
      {
        calendarId: selectedImportCalendarId,
        icsContent: pickedFile.content,
        fileName: pickedFile.name,
      },
      { onSuccess: () => setPickedFile(null) },
    );
  };

  const handleAddHoliday = (holiday: HolidayCalendar) => {
    createSubscription.mutate({
      name: holiday.label,
      url: holiday.url,
      color: holiday.defaultColor,
    });
  };

  const feedError = feedErrors.name ?? feedErrors.url;

  return (
    <SheetScroll>
      <SheetSection title="Subscribe to a feed" footer={SUBSCRIPTION_FEED_URL_HELP_TEXT}>
        <SheetGroup>
          <SheetTextField
            key="name"
            value={feedName}
            onChangeText={(value) => {
              setFeedName(value);
              setFeedErrors((previous) => ({ ...previous, name: undefined }));
            }}
            placeholder="Name"
            accessibilityLabel="Feed name"
          />
          <SheetTextField
            key="url"
            value={feedUrl}
            onChangeText={(value) => {
              setFeedUrl(value);
              setFeedErrors((previous) => ({ ...previous, url: undefined }));
            }}
            placeholder="https://example.com/calendar.ics"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            accessibilityLabel="Feed URL"
          />
        </SheetGroup>
        {feedError ? <SheetMessage tone="destructive" text={feedError} /> : null}
      </SheetSection>

      <SheetSection title="Feed color">
        <SheetGroup>
          <SheetGroupBlock>
            <ColorPicker
              selectedColor={isNamedCalendarColor(feedColor) ? feedColor : undefined}
              onColorSelect={setFeedColor}
            />
          </SheetGroupBlock>
        </SheetGroup>
        {feedErrors.color ? <SheetMessage tone="destructive" text={feedErrors.color} /> : null}
      </SheetSection>

      <SheetButton
        label="Add feed"
        onPress={handleAddFeed}
        pending={pendingSubscriptionUrl === normalizeSubscriptionUrl(feedUrl)}
        disabled={createSubscription.isPending}
      />

      <SheetSection
        title="Import an .ics file"
        footer={
          ownedCalendars.length === 0
            ? "Create a calendar before importing events from a file."
            : "Events are copied once into the calendar you choose."
        }
      >
        <SheetGroup>
          <SheetItem
            label={pickedFile ? pickedFile.name : "Choose file"}
            detail={pickedFile ? "Tap to choose another file" : undefined}
            icon="file-text"
            chevron
            disabled={ownedCalendars.length === 0}
            onPress={() => void handlePickFile()}
          />
        </SheetGroup>
      </SheetSection>

      {pickedFile && ownedCalendars.length > 0 ? (
        <>
          <SheetSection title="Import into">
            <SheetGroup>
              {ownedCalendars.map((calendar) => {
                const selected = calendar.id === selectedImportCalendarId;
                return (
                  <SheetItem
                    key={calendar.id}
                    label={calendar.name}
                    detail={calendar.isDefault ? "Default" : undefined}
                    swatch={resolveCalendarSwatchColor(calendar.color, theme)}
                    checked={selected}
                    onPress={() => setImportCalendarId(calendar.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                  />
                );
              })}
            </SheetGroup>
          </SheetSection>
          <SheetButton label="Import events" onPress={handleImport} pending={importIcs.isPending} />
        </>
      ) : null}

      <SheetSection title="Holidays">
        <SheetGroup>
          <SheetTextField
            value={holidaySearch}
            onChangeText={setHolidaySearch}
            placeholder="Search country or language"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search holiday calendars"
          />
        </SheetGroup>
        {filteredHolidays.length === 0 ? (
          <SheetMessage text="No holiday calendars match your search." />
        ) : (
          <SheetGroup>
            {filteredHolidays.map((holiday) => {
              const added = subscribedUrls.has(normalizeSubscriptionUrl(holiday.url));
              return (
                <SheetItem
                  key={holiday.id}
                  label={holiday.label}
                  detail={
                    holiday.language
                      ? `${holiday.countryName} · ${holiday.language}`
                      : holiday.countryName
                  }
                  swatch={resolveCalendarSwatchColor(holiday.defaultColor, theme)}
                  accessory={added ? "check" : "plus"}
                  pending={pendingSubscriptionUrl === holiday.url}
                  onPress={added ? undefined : () => handleAddHoliday(holiday)}
                  accessibilityLabel={`Add ${holiday.label}`}
                />
              );
            })}
          </SheetGroup>
        )}
      </SheetSection>
    </SheetScroll>
  );
}
