import { format } from "date-fns";

export interface TimeValidationResult {
  isValid: boolean;
  time?: string;
  error?: string;
}

export const formatTimeForInput = (date: Date) => {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes();
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
};

export const validateTime = (timeString: string): TimeValidationResult => {
  if (!timeString || timeString.trim() === '') {
    return { isValid: false, error: 'Time is required' };
  }

  // Clean the input - remove any non-digit or colon characters
  const cleaned = timeString.replace(/[^\d:]/g, '');

  // Handle various input formats
  let formattedTime = cleaned;

  // Convert common formats to HH:MM
  if (/^\d{1,2}$/.test(cleaned)) {
    // Just hours: "9" -> "09:00"
    const hours = parseInt(cleaned, 10);
    if (hours >= 0 && hours <= 23) {
      formattedTime = `${hours.toString().padStart(2, '0')}:00`;
    } else {
      return { isValid: false, error: 'Hours must be between 0-23' };
    }
  } else if (/^\d{3,4}$/.test(cleaned)) {
    // HHMM format: "930" -> "09:30" or "1430" -> "14:30"
    let hours, minutes;
    if (cleaned.length === 3) {
      hours = parseInt(cleaned.slice(0, 1), 10);
      minutes = parseInt(cleaned.slice(1), 10);
    } else {
      hours = parseInt(cleaned.slice(0, 2), 10);
      minutes = parseInt(cleaned.slice(2), 10);
    }

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    } else {
      return { isValid: false, error: 'Invalid time format' };
    }
  }

  // Validate HH:MM format
  const timeRegex = /^(\d{1,2}):(\d{1,2})$/;
  const match = formattedTime.match(timeRegex);

  if (!match) {
    return { isValid: false, error: 'Use HH:MM format (e.g. 09:30)' };
  }

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);

  if (hours < 0 || hours > 23) {
    return { isValid: false, error: 'Hours must be between 0-23' };
  }

  if (minutes < 0 || minutes > 59) {
    return { isValid: false, error: 'Minutes must be between 0-59' };
  }

  return {
    isValid: true,
    time: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
  };
};

export const timeToMinutes = (timeString: string): number => {
  const [hoursStr, minutesStr] = timeString.split(':');
  const hours = parseInt(hoursStr || '0', 10);
  const minutes = parseInt(minutesStr || '0', 10);
  return hours * 60 + minutes;
};

export const minutesToTime = (totalMinutes: number): string => {
  const normalizedMinutes = Math.max(0, totalMinutes % (24 * 60));
  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

export const scrollToSelectedTime = (dropdownRef: React.RefObject<HTMLDivElement | null>, selectedTime: string) => {
  if (!dropdownRef.current) return;

  // Try to find exact match first
  const selectedButton = dropdownRef.current.querySelector(`[data-time-value="${selectedTime}"]`) as HTMLElement;
  if (selectedButton) {
    // Scroll to the selected time with center alignment
    selectedButton.scrollIntoView({
      block: 'center',
      behavior: 'smooth'
    });
    return;
  }

  // If no exact match, find the closest time option
  const selectedMinutes = timeToMinutes(selectedTime);

  // Find the closest time option by rounding to nearest 15 minutes
  const roundedMinutes = Math.floor(selectedMinutes / 15) * 15;
  const roundedTime = minutesToTime(roundedMinutes);

  const closestButton = dropdownRef.current.querySelector(`[data-time-value="${roundedTime}"]`) as HTMLElement;
  if (closestButton) {
    closestButton.scrollIntoView({
      block: 'center',
      behavior: 'smooth'
    });
  } else {
    // Fallback: scroll to approximate position based on time
    const container = dropdownRef.current;
    const totalOptions = container.children.length;
    const timeIndex = Math.floor(selectedMinutes / 15); // 15-minute intervals
    const scrollPosition = (timeIndex / totalOptions) * container.scrollHeight;
    container.scrollTo({
      top: scrollPosition,
      behavior: 'smooth'
    });
  }
};

export const generateAllTimeOptions = (timeFormat?: string) => {
  const options = [];

  for (let hour = 0; hour <= 23; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const formattedHour = hour.toString().padStart(2, "0");
      const formattedMinute = minute.toString().padStart(2, "0");
      const value = `${formattedHour}:${formattedMinute}`;
      const date = new Date(2000, 0, 1, hour, minute);
      
      // Use 24h format if explicitly set to "24h", otherwise use 12h format
      const label = timeFormat === "24h"
        ? `${formattedHour}:${formattedMinute}`
        : format(date, "h:mm a");
      
      options.push({ value, label });
    }
  }
  return options;
};