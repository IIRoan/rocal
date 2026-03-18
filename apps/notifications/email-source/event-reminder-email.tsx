import * as React from "react";

function GoTemplateTag({ children }: { children: string }) {
  return <>{children}</>;
}

function MetaRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", gap: "12px", padding: "10px 0" }}>
      <div style={{ flex: "1 1 80px", minWidth: "72px" }}>
        <p
          style={{
            margin: 0,
            fontSize: "11px",
            lineHeight: "14px",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#737373",
            fontWeight: 600,
          }}
        >
          {label}
        </p>
      </div>
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: "14px",
            lineHeight: "20px",
            color: "#262626",
            fontWeight: 400,
            wordBreak: "break-word",
          }}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

export function EventReminderEmailTemplate() {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta content="width=device-width, initial-scale=1.0" name="viewport" />
        <title>{`{{.EventTitle}} - {{.TimeUntilEvent}}`}</title>
      </head>
      <body
        style={{
          margin: 0,
          padding: "24px 16px",
          backgroundColor: "#fafafa",
          color: "#1a1a1a",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <div
          style={{
            display: "none",
            overflow: "hidden",
            lineHeight: "1px",
            opacity: 0,
            maxHeight: 0,
            maxWidth: 0,
          }}
        >
          {"{{.TimeUntilEvent}}"} for {"{{.EventTitle}}"}.
        </div>

        <div style={{ margin: "0 auto", maxWidth: "500px" }}>
          <div
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e5e5e5",
              borderRadius: "24px",
              overflow: "hidden",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
            }}
          >
            {/* Header */}
            <div style={{ padding: "28px 28px 20px" }}>
              <p
                style={{
                  margin: "0 0 6px",
                  fontSize: "11px",
                  lineHeight: "14px",
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "#8b8b8b",
                  fontWeight: 600,
                }}
              >
                {"{{.TimeUntilEvent}}"}
              </p>
              <h1
                style={{
                  margin: 0,
                  fontSize: "24px",
                  lineHeight: "30px",
                  letterSpacing: "-0.02em",
                  color: "#1a1a1a",
                  fontWeight: 600,
                  wordBreak: "break-word",
                }}
              >
                {"{{.EventTitle}}"}
              </h1>
            </div>

            {/* Details */}
            <div style={{ padding: "0 28px 24px" }}>
              <div style={{ borderTop: "1px solid #f0f0f0" }}>
                <MetaRow label="Date" value={"{{.EventDate}}"} />
                <MetaRow label="Time" value={"{{.EventTime}}"} />
                <GoTemplateTag>{"{{if .CalendarName}}"}</GoTemplateTag>
                <MetaRow label="Calendar" value={"{{.CalendarName}}"} />
                <GoTemplateTag>{"{{end}}"}</GoTemplateTag>
                <GoTemplateTag>{"{{if .EventLocation}}"}</GoTemplateTag>
                <MetaRow label="Location" value={"{{.EventLocation}}"} />
                <GoTemplateTag>{"{{end}}"}</GoTemplateTag>
                <GoTemplateTag>{"{{if .Duration}}"}</GoTemplateTag>
                <MetaRow label="Duration" value={"{{.Duration}}"} />
                <GoTemplateTag>{"{{end}}"}</GoTemplateTag>
              </div>

              <div style={{ paddingTop: "16px" }}>
                <a
                  href={"{{.EventUrl}}"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    height: "44px",
                    borderRadius: "12px",
                    backgroundColor: "#1a1a1a",
                    color: "#ffffff",
                    textDecoration: "none",
                    fontSize: "14px",
                    lineHeight: "20px",
                    fontWeight: 500,
                    transition: "opacity 0.15s ease",
                  }}
                >
                  Open Event
                </a>
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: "18px 28px",
                borderTop: "1px solid #f0f0f0",
                backgroundColor: "#fafafa",
              }}
            >
              <p
                style={{
                  margin: "0 0 14px",
                  fontSize: "12px",
                  lineHeight: "17px",
                  color: "#737373",
                }}
              >
                This reminder was sent because email notifications are enabled
                for your account.
              </p>

              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: "24px",
                  fontSize: "11px",
                  lineHeight: "16px",
                  letterSpacing: "0.05em",
                  textTransform: "none",
                  fontWeight: 400,
                }}
              >
                <a
                  href={"{{.SettingsUrl}}"}
                  style={{ color: "#525252", textDecoration: "none" }}
                >
                  Settings
                </a>
                <a
                  href={"{{.PrivacyUrl}}"}
                  style={{ color: "#525252", textDecoration: "none" }}
                >
                  Privacy
                </a>
                <a
                  href={"{{.CalendarUrl}}"}
                  style={{ color: "#525252", textDecoration: "none" }}
                >
                  Calendar
                </a>
              </div>
            </div>
          </div>

          {/* Branding below card */}
          <p
            style={{
              textAlign: "center",
              margin: "18px 0 0",
              fontSize: "13px",
              lineHeight: "18px",
              color: "#a3a3a3",
              fontWeight: 600,
              letterSpacing: "0.02em",
            }}
          >
            Solace
          </p>
        </div>
      </body>
    </html>
  );
}
