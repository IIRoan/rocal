import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Hr,
  Font,
  Tailwind,
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
  userTheme?: "light" | "dark" | "system";
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
  userTheme = "light",
}: EventReminderEmailProps) => {
  const isDark = userTheme === "dark";
  
  const colors = isDark ? {
    background: "#2A2A2A",
    foreground: "#F0F0F0", 
    card: "#2A2A2A",
    cardForeground: "#F0F0F0",
    primary: "#E0E0E0",
    primaryForeground: "#2A2A2A",
    secondary: "#3A3A3A",
    secondaryForeground: "#F0F0F0",
    muted: "#3A3A3A",
    mutedForeground: "#A0A0A0",
    accent: "#A0A0A0",
    accentForeground: "#1A1A1A",
    border: "#3A3A3A",
    ring: "#A0A0A0"
  } : {
    background: "#FEFEFE",
    foreground: "#1A1A1A",
    card: "#FEFEFE", 
    cardForeground: "#1A1A1A",
    primary: "#1A1A1A",
    primaryForeground: "#FAFAFA",
    secondary: "#F0F0F0",
    secondaryForeground: "#1A1A1A",
    muted: "#F0F0F0",
    mutedForeground: "#808080",
    accent: "#808080",
    accentForeground: "#FAFAFA",
    border: "#F0F0F0",
    ring: "#808080"
  };

  const getCategoryAccentColor = (color: string) => {
    const colorMap: Record<string, string> = {
      blue: isDark ? "#3B82F6" : "#2563EB",
      orange: isDark ? "#F97316" : "#EA580C", 
      violet: isDark ? "#8B5CF6" : "#7C3AED",
      rose: isDark ? "#F43F5E" : "#E11D48",
      emerald: isDark ? "#10B981" : "#059669"
    };
    return colorMap[color] || colors.accent;
  };

  return (
    <Html>
      <Head>
        <Font
          fontFamily="Inter"
          fallbackFontFamily="Arial"
          webFont={{
            url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Preview>Reminder: {eventTitle} starts {timeUntilEvent}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: colors.background, fontFamily: "Inter, system-ui, sans-serif" }}>
        <Container style={{ maxWidth: "600px", margin: "0 auto", backgroundColor: colors.background }}>
          {/* Header */}
          <Section style={{ textAlign: "center", padding: "32px 24px 24px", borderBottom: `1px solid ${colors.border}` }}>
            <Heading style={{ fontSize: "24px", fontWeight: "600", color: colors.primary, margin: "0 0 8px 0" }}>
              📅 Rocani
            </Heading>
            <Text style={{ color: colors.mutedForeground, fontSize: "14px", margin: 0 }}>
              Event Reminder
            </Text>
          </Section>

          {/* Content */}
          <Section style={{ padding: "32px 24px" }}>
            {/* Event Card */}
            <Section style={{
              backgroundColor: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: "12px",
              padding: "24px",
              marginBottom: "24px",
              boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)"
            }}>
              {/* Event Header */}
              <Section style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "16px" }}>
                <div style={{
                  width: "4px",
                  height: "48px",
                  backgroundColor: getCategoryAccentColor(categoryColor),
                  borderRadius: "2px",
                  flexShrink: 0
                }} />
                <Section>
                  <Heading style={{
                    fontSize: "20px",
                    fontWeight: "600",
                    color: colors.cardForeground,
                    margin: "0 0 4px 0"
                  }}>
                    {eventTitle}
                  </Heading>
                  <Text style={{
                    display: "inline-block",
                    backgroundColor: `${colors.accent}20`,
                    color: colors.accent,
                    padding: "4px 8px",
                    borderRadius: "6px",
                    fontSize: "12px",
                    fontWeight: "500",
                    textTransform: "uppercase",
                    letterSpacing: "0.025em",
                    margin: 0
                  }}>
                    Starting {timeUntilEvent}
                  </Text>
                </Section>
              </Section>

              {/* Event Details */}
              <Section style={{ marginTop: "16px" }}>
                <Section style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", fontSize: "14px" }}>
                  <span style={{ fontWeight: "500", color: colors.cardForeground, minWidth: "60px" }}>Date:</span>
                  <span style={{ color: colors.mutedForeground }}>{eventDate}</span>
                </Section>
                
                <Section style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", fontSize: "14px" }}>
                  <span style={{ fontWeight: "500", color: colors.cardForeground, minWidth: "60px" }}>Time:</span>
                  <span style={{ color: colors.mutedForeground }}>{eventTime}</span>
                </Section>
                
                {eventLocation && (
                  <Section style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", fontSize: "14px" }}>
                    <span style={{ fontWeight: "500", color: colors.cardForeground, minWidth: "60px" }}>Location:</span>
                    <span style={{ color: colors.mutedForeground }}>{eventLocation}</span>
                  </Section>
                )}
                
                {categoryName && (
                  <Section style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", fontSize: "14px" }}>
                    <span style={{ fontWeight: "500", color: colors.cardForeground, minWidth: "60px" }}>Category:</span>
                    <span style={{ color: colors.mutedForeground }}>{categoryName}</span>
                  </Section>
                )}
              </Section>

              {/* Description */}
              {description && (
                <Section style={{
                  backgroundColor: colors.muted,
                  padding: "12px",
                  borderRadius: "8px",
                  marginTop: "12px",
                  fontSize: "14px",
                  color: colors.mutedForeground,
                  lineHeight: "1.4"
                }}>
                  <Text style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                    {description}
                  </Text>
                </Section>
              )}
            </Section>
          </Section>

          {/* Footer */}
          <Section style={{
            padding: "24px",
            borderTop: `1px solid ${colors.border}`,
            textAlign: "center"
          }}>
            <Text style={{
              fontSize: "12px",
              color: colors.mutedForeground,
              lineHeight: "1.4",
              margin: 0
            }}>
              This reminder was sent because you have email notifications enabled.<br />
              You can manage your notification preferences in your calendar settings.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default EventReminderEmail;