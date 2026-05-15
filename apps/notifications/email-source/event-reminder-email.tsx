import * as React from "react";

function GoTemplateTag({ children }: { children: string }) {
  return <>{children}</>;
}

function DetailBlock({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "18px" }}>
      <div
        className="detail-label"
        style={{
          fontSize: "11px",
          lineHeight: "14px",
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase" as const,
          color: "#999",
          marginBottom: "4px",
        }}
      >
        {label}
      </div>
      <div
        className="detail-value"
        style={{
          fontSize: "16px",
          lineHeight: "22px",
          fontWeight: 400,
          color: "#1a1a1a",
          wordBreak: "break-word" as const,
        }}
      >
        {value}
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
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <title>{`{{.EventTitle}} - {{.TimeUntilEvent}}`}</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
            :root { color-scheme: light dark; }
            body { background-color: #ffffff !important; color: #1a1a1a !important; }
            @media (prefers-color-scheme: dark) {
              body { background-color: #1a1a1a !important; color: #e5e5e5 !important; }
              .email-title { color: #ffffff !important; }
              .email-subtitle { color: rgba(255,255,255,0.55) !important; }
              .detail-label { color: rgba(255,255,255,0.40) !important; }
              .detail-value { color: #e5e5e5 !important; }
              .email-btn { background: #2a2a2a !important; color: #ffffff !important; border-color: rgba(255,255,255,0.15) !important; }
              .email-hr { background-color: #333 !important; }
              .email-footer { color: #666 !important; }
              .email-footer a { color: #666 !important; }
            }
          `,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: "#ffffff",
          color: "#1a1a1a",
          fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
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

        <div
          style={{
            margin: "0 auto",
            maxWidth: "555px",
            padding: "48px 28px 40px",
          }}
        >
          {/* Logo */}
          <a
            href={"{{.CalendarUrl}}"}
            style={{ outline: "none", textDecoration: "none" }}
          >
            <img
              src={"{{.LogoUrl}}"}
              alt="Solace"
              width="36"
              height="36"
              style={{
                display: "block",
                width: "36px",
                height: "36px",
                border: 0,
                marginBottom: "28px",
              }}
            />
          </a>

          {/* Title */}
          <h1
            className="email-title"
            style={{
              margin: 0,
              fontSize: "22px",
              lineHeight: "130%",
              fontWeight: 700,
              letterSpacing: "-0.01em",
              color: "#000",
            }}
          >
            {"{{.EventTitle}}"}
          </h1>
          <p
            className="email-subtitle"
            style={{
              margin: "6px 0 0",
              fontSize: "15px",
              lineHeight: "130%",
              color: "rgba(0, 0, 0, 0.50)",
            }}
          >
            {"{{.TimeUntilEvent}}"}
          </p>

          {/* Details */}
          <div style={{ marginTop: "28px" }}>
            <DetailBlock
              label="When"
              value={
                <>
                  {"{{.EventDate}}"} {"·"} {"{{.EventTime}}"}
                </>
              }
            />

            <GoTemplateTag>{"{{if .EventLocation}}"}</GoTemplateTag>
            <DetailBlock label="Where" value={"{{.EventLocation}}"} />
            <GoTemplateTag>{"{{end}}"}</GoTemplateTag>

            <GoTemplateTag>{"{{if .CalendarName}}"}</GoTemplateTag>
            <DetailBlock label="Calendar" value={"{{.CalendarName}}"} />
            <GoTemplateTag>{"{{end}}"}</GoTemplateTag>

            <GoTemplateTag>{"{{if .Duration}}"}</GoTemplateTag>
            <DetailBlock label="Duration" value={"{{.Duration}}"} />
            <GoTemplateTag>{"{{end}}"}</GoTemplateTag>
          </div>

          {/* Button */}
          <table
            border={0}
            cellPadding={0}
            cellSpacing={0}
            style={{
              borderCollapse: "separate",
              width: "fit-content",
              lineHeight: "100%",
              padding: "6px 0 0",
            }}
          >
            <tbody>
              <tr>
                <td align="center" valign="middle">
                  <a
                    className="email-btn"
                    href={"{{.EventUrl}}"}
                    style={{
                      display: "inline-block",
                      background: "#fff",
                      color: "#000",
                      fontFamily:
                        '"Helvetica Neue", Helvetica, Arial, sans-serif',
                      fontSize: "15px",
                      fontWeight: 500,
                      lineHeight: "100%",
                      margin: 0,
                      textDecoration: "none",
                      padding: "12px 20px",
                      border: "1px solid rgba(0, 0, 0, 0.12)",
                      borderBottom: "2px solid rgba(0, 0, 0, 0.12)",
                      borderRadius: "12px",
                    }}
                  >
                    Open Event
                  </a>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Footer divider */}
          <hr
            className="email-hr"
            style={{
              border: "none",
              height: "1px",
              backgroundColor: "#e5e5e5",
              margin: "36px 0 20px 0",
            }}
          />

          {/* Footer */}
          <p
            className="email-footer"
            style={{
              margin: "0 0 6px",
              fontSize: "12px",
              lineHeight: "1.4",
              color: "#a8a8a8",
              fontWeight: 600,
            }}
          >
            Solace
          </p>
          <p
            className="email-footer"
            style={{
              margin: "0 0 4px",
              fontSize: "12px",
              lineHeight: "1.5",
              color: "#a8a8a8",
            }}
          >
            This reminder was sent because email notifications are enabled for
            your account.
          </p>
          <p
            className="email-footer"
            style={{
              margin: 0,
              fontSize: "12px",
              lineHeight: "1.5",
              color: "#a8a8a8",
            }}
          >
            <a
              className="email-footer"
              href={"{{.SettingsUrl}}"}
              style={{ color: "#a8a8a8", textDecoration: "underline" }}
            >
              Settings
            </a>
            {" \u00B7 "}
            <a
              className="email-footer"
              href={"{{.PrivacyUrl}}"}
              style={{ color: "#a8a8a8", textDecoration: "underline" }}
            >
              Privacy
            </a>
            {" \u00B7 "}
            <a
              className="email-footer"
              href={"{{.CalendarUrl}}"}
              style={{ color: "#a8a8a8", textDecoration: "underline" }}
            >
              Calendar
            </a>
          </p>
        </div>
      </body>
    </html>
  );
}
