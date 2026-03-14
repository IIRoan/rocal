import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Font,
  Img,
} from "@react-email/components";
import * as React from "react";

interface EventReminderEmailProps {
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  eventLocation?: string;
  categoryName?: string;
  categoryColor?: string;
  description?: string;
  timeUntilEvent: string;
  duration?: string;
  reminderText?: string;
  userName?: string;
  userEmail?: string;
  userTheme?: "light" | "dark" | "system";
  // Optional deep link to view the event in the app
  calendarUrl?: string;
}

export const EventReminderEmail = ({
  eventTitle = "Sample Event",
  eventDate = "January 1, 2024",
  eventTime = "9:00 AM",
  eventLocation,
  categoryName,
  categoryColor = "blue",
  description,
  timeUntilEvent = "in 15 minutes",
  duration,
  reminderText,
  userName,
  userEmail,
  userTheme = "light",
  calendarUrl,
}: EventReminderEmailProps) => {
  const isDark = userTheme === "dark";

  const colors = isDark
    ? {
        background: "#0C0A09",
        foreground: "#FAFAF9",
        card: "#1C1917",
        cardForeground: "#FAFAF9",
        primary: "#FAFAF9",
        primaryForeground: "#0C0A09",
        secondary: "#292524",
        secondaryForeground: "#FAFAF9",
        muted: "#292524",
        mutedForeground: "#A8A29E",
        accent: "#292524",
        accentForeground: "#FAFAF9",
        border: "#44403C",
        ring: "#D6D3D1",
        calendarAccent: "#3B82F6",
        logoFill: "#FAFAF9",
      }
    : {
        background: "#FFFFFF",
        foreground: "#0C0A09",
        card: "#FFFFFF",
        cardForeground: "#0C0A09",
        primary: "#0C0A09",
        primaryForeground: "#FAFAF9",
        secondary: "#F5F5F4",
        secondaryForeground: "#0C0A09",
        muted: "#F5F5F4",
        mutedForeground: "#78716C",
        accent: "#F5F5F4",
        accentForeground: "#0C0A09",
        border: "#E7E5E4",
        ring: "#D6D3D1",
        calendarAccent: "#3B82F6",
        logoFill: "#0C0A09",
      };
  // Resolve category accent to a hex color (supports hex and named variants)
  const getCategoryAccentColor = (color: string | undefined): string => {
    if (!color) return colors.calendarAccent;
    const c = color.toLowerCase();
    if (c.startsWith("#")) return c; // already a hex

    // Updated color mapping to match app's event colors
    const map: Record<string, string> = {
      sky: "#0EA5E9",
      blue: "#3B82F6",
      azure: "#0EA5E9",
      orange: "#F97316",
      amber: "#F59E0B",
      violet: "#8B5CF6",
      purple: "#8B5CF6",
      rose: "#F43F5E",
      pink: "#EC4899",
      emerald: "#10B981",
      green: "#10B981",
      default: "#0EA5E9",
    };
    return map[c] || colors.accent;
  };

  // Derive a subtle translucent background for accent chips (12.5% opacity)
  const withAlpha20 = (hex: string): string => {
    if (!hex.startsWith("#")) return `${colors.accent}20`;
    // Normalize #RGB to #RRGGBB
    const normalized =
      hex.length === 4
        ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
        : hex;
    return `${normalized}20`;
  };

  // Extract month/day from eventDate for a mini calendar badge
  const parseMonthDay = (
    dateStr: string,
  ): { month: string; day: string } | null => {
    try {
      const d = new Date(dateStr);
      if (!Number.isNaN(d.getTime())) {
        return {
          month: d.toLocaleString("en-US", { month: "short" }).toUpperCase(),
          day: String(d.getDate()).padStart(2, "0"),
        };
      }
    } catch (_) {
      // ignore
    }
    const match = dateStr.match(/([A-Za-z]+)\s+(\d{1,2})/);
    if (match) {
      return {
        month: match[1].slice(0, 3).toUpperCase(),
        day: match[2].padStart(2, "0"),
      };
    }
    return null;
  };

  const accent = getCategoryAccentColor(categoryColor);
  const dateParts = parseMonthDay(eventDate);

  return (
    <Html>
      <Head>
        <Font
          fontFamily="Inter"
          fallbackFontFamily="Arial"
          webFont={{
            url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Preview>
        Reminder: {eventTitle} starts {timeUntilEvent}
      </Preview>
      <Body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: colors.background,
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <Container
          style={{
            maxWidth: "600px",
            margin: "0 auto",
            backgroundColor: colors.background,
          }}
        >
          {/* Header */}
          <Section
            style={{
              textAlign: "center",
              padding: "32px 24px 24px",
              borderBottom: `1px solid ${colors.border}`,
              backgroundColor: colors.card,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "12px",
                marginBottom: "8px",
              }}
            >
              <Heading
                style={{
                  fontSize: "24px",
                  fontWeight: 700,
                  color: colors.primary,
                  margin: 0,
                  letterSpacing: "-0.025em",
                }}
              >
                Solace
              </Heading>
            </div>
            <Text
              style={{
                color: colors.mutedForeground,
                fontSize: "14px",
                margin: 0,
                fontWeight: 500,
              }}
            >
              Event Reminder
            </Text>
            {reminderText && (
              <Text
                style={{
                  display: "inline-block",
                  backgroundColor: withAlpha20(accent),
                  color: accent,
                  padding: "6px 10px",
                  borderRadius: 999,
                  fontSize: "12px",
                  fontWeight: 600,
                  marginTop: 10,
                }}
              >
                {reminderText}
              </Text>
            )}
          </Section>

          {/* Content */}
          <Section style={{ padding: "28px 24px" }}>
            {/* Event Card */}
            <Section
              style={{
                backgroundColor: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: 12,
                padding: 24,
                marginBottom: 20,
                boxShadow:
                  "0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
              }}
            >
              {/* Event Header */}
              <Section
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  marginBottom: 14,
                }}
              >
                {/* Date Badge */}
                {dateParts && (
                  <div
                    style={{
                      width: 64,
                      borderRadius: 12,
                      border: `1px solid ${colors.border}`,
                      overflow: "hidden",
                      textAlign: "center",
                      backgroundColor: colors.secondary,
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        backgroundColor: accent,
                        color: "#FFFFFF",
                        fontSize: 12,
                        fontWeight: 700,
                        padding: "6px 0",
                        letterSpacing: 0.6,
                      }}
                    >
                      {dateParts.month}
                    </div>
                    <div
                      style={{
                        fontSize: 26,
                        fontWeight: 700,
                        color: colors.cardForeground,
                        padding: "8px 0",
                        lineHeight: 1,
                      }}
                    >
                      {dateParts.day}
                    </div>
                  </div>
                )}

                {/* Title & Meta */}
                <Section style={{ flex: 1 }}>
                  <Heading
                    style={{
                      fontSize: 20,
                      fontWeight: 700,
                      color: colors.cardForeground,
                      margin: "0 0 6px 0",
                    }}
                  >
                    {eventTitle}
                  </Heading>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span
                      style={{
                        display: "inline-block",
                        backgroundColor: withAlpha20(accent),
                        color: accent,
                        padding: "4px 8px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: 0.4,
                      }}
                    >
                      Starting {timeUntilEvent}
                    </span>
                    {categoryName && (
                      <span
                        style={{
                          display: "inline-block",
                          backgroundColor: withAlpha20(accent),
                          color: accent,
                          padding: "4px 8px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                          letterSpacing: 0.2,
                        }}
                      >
                        {categoryName}
                      </span>
                    )}
                  </div>
                </Section>
              </Section>

              {/* Event Details */}
              <Section style={{ marginTop: 8 }}>
                <Section
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                    fontSize: 14,
                  }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      color: colors.cardForeground,
                      minWidth: 64,
                    }}
                  >
                    Date:
                  </span>
                  <span style={{ color: colors.mutedForeground }}>
                    {eventDate}
                  </span>
                </Section>

                <Section
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                    fontSize: 14,
                  }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      color: colors.cardForeground,
                      minWidth: 64,
                    }}
                  >
                    Time:
                  </span>
                  <span style={{ color: colors.mutedForeground }}>
                    {eventTime}
                  </span>
                </Section>

                {eventLocation && (
                  <Section
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                      fontSize: 14,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        color: colors.cardForeground,
                        minWidth: 64,
                      }}
                    >
                      Location:
                    </span>
                    <span style={{ color: colors.mutedForeground }}>
                      {eventLocation}
                    </span>
                  </Section>
                )}

                {duration && (
                  <Section
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                      fontSize: 14,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        color: colors.cardForeground,
                        minWidth: 64,
                      }}
                    >
                      Duration:
                    </span>
                    <span style={{ color: colors.mutedForeground }}>
                      {duration}
                    </span>
                  </Section>
                )}
              </Section>

              {/* Description */}
              {description && (
                <Section
                  style={{
                    backgroundColor: colors.muted,
                    padding: 12,
                    borderRadius: 10,
                    marginTop: 10,
                    fontSize: 14,
                    color: colors.mutedForeground,
                    lineHeight: 1.5,
                  }}
                >
                  <Text style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                    {description}
                  </Text>
                </Section>
              )}
            </Section>

            {/* CTA */}
            {calendarUrl && (
              <Section style={{ textAlign: "center", marginTop: 4 }}>
                <a
                  href={calendarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block",
                    backgroundColor: accent,
                    color: "#FFFFFF",
                    padding: "10px 16px",
                    borderRadius: 10,
                    fontWeight: 600,
                    fontSize: 14,
                    textDecoration: "none",
                  }}
                >
                  Open in Calendar
                </a>
              </Section>
            )}
          </Section>

          {/* Footer */}
          <Section
            style={{
              padding: 24,
              borderTop: `1px solid ${colors.border}`,
              textAlign: "center",
            }}
          >
            {userName && (
              <Text
                style={{
                  fontSize: 14,
                  color: colors.cardForeground,
                  margin: "0 0 10px 0",
                }}
              >
                Hi {userName}! 👋
              </Text>
            )}
            <Text
              style={{
                fontSize: 12,
                color: colors.mutedForeground,
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              You’re receiving this because event notifications are enabled.
              <br />
              Manage your preferences any time in Calendar settings.
            </Text>
            {userEmail && (
              <Text
                style={{
                  fontSize: 11,
                  color: colors.mutedForeground,
                  margin: "8px 0 0 0",
                  opacity: 0.7,
                }}
              >
                Sent to: {userEmail}
              </Text>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default EventReminderEmail;
