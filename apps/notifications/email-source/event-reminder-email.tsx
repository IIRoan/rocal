import * as React from "react";
import {
  EmailLayout,
  EmailButton,
  EmailDivider,
  EmailBadge,
} from "../../../packages/ui/src/components/email/email-primitives";

function GoTemplateTag({ children }: { children: string }) {
  return <>{children}</>;
}

function EventContent() {
  return (
    <div>
      {/* Time badge */}
      <div style={{ marginBottom: "24px" }}>
        <EmailBadge>{"{{.TimeUntilEvent}}"}</EmailBadge>
      </div>

      {/* Date & Time - prominent display */}
      <div style={{ marginBottom: "20px" }}>
        <p
          style={{
            margin: 0,
            fontSize: "18px",
            lineHeight: "28px",
            fontWeight: 600,
            color: "#1f1b17",
          }}
        >
          {"{{.EventDate}}"}
        </p>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: "16px",
            lineHeight: "24px",
            color: "#7a756f",
          }}
        >
          {"{{.EventTime}}"}
        </p>
      </div>

      {/* Location - if present */}
      <GoTemplateTag>{"{{if .EventLocation}}"}</GoTemplateTag>
      <div style={{ marginBottom: "16px", display: "flex", alignItems: "flex-start", gap: "8px" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7a756f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: "2px", flexShrink: 0 }}>
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <p
          style={{
            margin: 0,
            fontSize: "15px",
            lineHeight: "22px",
            color: "#1f1b17",
          }}
        >
          {"{{.EventLocation}}"}
        </p>
      </div>
      <GoTemplateTag>{"{{end}}"}</GoTemplateTag>

      {/* Category - if present */}
      <GoTemplateTag>{"{{if .CategoryName}}"}</GoTemplateTag>
      <div style={{ marginBottom: "16px" }}>
        <EmailBadge color="{{if .CategoryColor}}{{.CategoryColor}}{{else}}{{end}}">
          {"{{.CategoryName}}"}
        </EmailBadge>
      </div>
      <GoTemplateTag>{"{{end}}"}</GoTemplateTag>

      {/* Duration - if present */}
      <GoTemplateTag>{"{{if .Duration}}"}</GoTemplateTag>
      <p
        style={{
          margin: "0 0 16px",
          fontSize: "14px",
          lineHeight: "20px",
          color: "#7a756f",
        }}
      >
        Duration: {"{{.Duration}}"}
      </p>
      <GoTemplateTag>{"{{end}}"}</GoTemplateTag>

      {/* Description - if present */}
      <GoTemplateTag>{"{{if .Description}}"}</GoTemplateTag>
      <EmailDivider />
      <p
        style={{
          margin: "16px 0 0",
          fontSize: "14px",
          lineHeight: "22px",
          color: "#6b6560",
        }}
      >
        {"{{.Description}}"}
      </p>
      <GoTemplateTag>{"{{end}}"}</GoTemplateTag>
    </div>
  );
}

function ActionSection() {
  return (
    <div style={{ marginTop: "32px", textAlign: "center" }}>
      <EmailButton href="{{.EventUrl}}">View Event</EmailButton>
      <div style={{ marginTop: "12px" }}>
        <EmailButton href="{{.CalendarUrl}}" variant="outline">
          Open Calendar
        </EmailButton>
      </div>
    </div>
  );
}

export function EventReminderEmailTemplate() {
  return (
    <EmailLayout
      footerBrand="Solace Calendar"
      footerNote="Hi {{.UserName}}, this reminder was sent to {{.UserEmail}}"
      logoAlt="Solace"
      logoSrc="https://solace.onl/logo.png"
      previewText="Reminder: {{.EventTitle}}"
      subtitle="{{.ReminderText}}"
      title="{{.EventTitle}}"
    >
      <EventContent />
      <ActionSection />
    </EmailLayout>
  );
}
