import type { TimeFormat } from "@workspace/calendar-core";

const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

interface UseAutocompleteTimepickerProps {
  timeFormat: TimeFormat;
  locale?: string;
  timeZone?: string;
}

export function useAutocompleteTimepicker({
  timeFormat,
  locale = "en-US",
  timeZone = currentTimezone,
}: UseAutocompleteTimepickerProps) {
  const generateTimeOptions = () => {
    const times = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 15) {
        const time = new Date();
        time.setHours(hour, minute, 0, 0);
        times.push(time);
      }
    }
    return times;
  };

  const timeOptions = generateTimeOptions();

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      hour12: timeFormat === "12h",
      timeZone: timeZone,
    }).format(date);
  };

  return {
    timeOptions,
    formatTime,
  };
}
