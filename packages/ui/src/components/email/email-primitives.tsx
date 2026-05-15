import * as React from "react";

// Design system palette matching web globals.css exactly
// Primary: oklch(0.4341 0.0392 41.9938) - warm amber/ochre
// Secondary: oklch(0.92 0.0651 74.3695) - warm cream/gold
// Converted to hex for email compatibility
const palette = {
  background: "#f8f7f4",
  surface: "#ffffff",
  card: "#fefefe",
  border: "#e8e4dc",
  foreground: "#1f1b17",
  muted: "#6b6560",
  mutedForeground: "#7a756f",
  primary: "#7a6547",
  primaryForeground: "#ffffff",
  secondary: "#f0e6d6",
  secondaryForeground: "#5c4d3d",
  accent: "#f5f0e8",
  success: "#4ade80",
  warning: "#fbbf24",
  ring: "#7a6547",
};

// Icon components as inline SVGs for email compatibility
function CalendarIcon({
  size = 16,
  color = palette.muted,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  );
}

function ClockIcon({
  size = 16,
  color = palette.muted,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function MapPinIcon({
  size = 16,
  color = palette.muted,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function TagIcon({
  size = 16,
  color = palette.muted,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
      <path d="M7 7h.01" />
    </svg>
  );
}

function FileTextIcon({
  size = 16,
  color = palette.muted,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
      <line x1="10" x2="8" y1="9" y2="9" />
    </svg>
  );
}

function TimerIcon({
  size = 16,
  color = palette.muted,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="10" x2="14" y1="2" y2="2" />
      <line x1="12" x2="15" y1="14" y2="11" />
      <circle cx="12" cy="14" r="8" />
    </svg>
  );
}

type EmailLayoutProps = {
  children: React.ReactNode;
  footerBrand: React.ReactNode;
  footerNote: React.ReactNode;
  logoAlt: string;
  logoSrc: string;
  previewText: string;
  subtitle: React.ReactNode;
  title: React.ReactNode;
};

type EmailSectionCardProps = {
  children: React.ReactNode;
};

type EmailPillProps = {
  children: React.ReactNode;
};

type EmailButtonProps = {
  children: React.ReactNode;
  href: string;
  variant?: "primary" | "secondary" | "outline";
};

type EmailDividerProps = {
  withPadding?: boolean;
};

type EmailDetailRowProps = {
  icon: "calendar" | "clock" | "mapPin" | "tag" | "fileText" | "timer";
  label: string;
  children: React.ReactNode;
};

export function EmailLayout({
  children,
  footerBrand,
  footerNote,
  logoAlt,
  logoSrc,
  previewText,
  subtitle,
  title,
}: EmailLayoutProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta content="width=device-width, initial-scale=1.0" name="viewport" />
        <title>{title}</title>
      </head>
      <body
        style={{
          margin: 0,
          padding: "32px 16px",
          backgroundColor: palette.background,
          color: palette.foreground,
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
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
          {previewText}
        </div>
        <div style={{ margin: "0 auto", maxWidth: "560px" }}>
          <div
            style={{
              backgroundColor: palette.card,
              border: `1px solid ${palette.border}`,
              borderRadius: "16px",
              boxShadow:
                "0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)",
              overflow: "hidden",
            }}
          >
            {/* Header - title prominent, no logo */}
            <div style={{ padding: "32px 32px 24px" }}>
              <h1
                style={{
                  margin: 0,
                  fontSize: "26px",
                  lineHeight: "32px",
                  fontWeight: 600,
                  letterSpacing: "-0.025em",
                  color: palette.foreground,
                }}
              >
                {title}
              </h1>
              {subtitle && (
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: "15px",
                    lineHeight: "24px",
                    color: palette.mutedForeground,
                  }}
                >
                  {subtitle}
                </p>
              )}
            </div>
            {/* Content */}
            <div style={{ padding: "0 32px 32px" }}>{children}</div>
            {/* Footer with logo */}
            <div
              style={{
                padding: "24px 32px",
                borderTop: `1px solid ${palette.border}`,
                textAlign: "center",
                backgroundColor: palette.accent,
              }}
            >
              <img
                alt={logoAlt}
                src={logoSrc}
                width="40"
                height="40"
                style={{
                  display: "block",
                  width: "40px",
                  height: "40px",
                  margin: "0 auto 12px",
                  borderRadius: "10px",
                }}
              />
              <p
                style={{
                  margin: 0,
                  fontSize: "13px",
                  lineHeight: "20px",
                  color: palette.mutedForeground,
                }}
              >
                {footerNote}
              </p>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: "14px",
                  lineHeight: "20px",
                  color: palette.foreground,
                  fontWeight: 500,
                }}
              >
                {footerBrand}
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

export function EmailSectionCard({ children }: EmailSectionCardProps) {
  return (
    <div
      style={{
        backgroundColor: palette.card,
        border: `1px solid ${palette.border}`,
        borderRadius: "12px",
        boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

export function EmailPill({ children }: EmailPillProps) {
  return (
    <div style={{ margin: "0 0 20px", textAlign: "center" }}>
      <span
        style={{
          display: "inline-block",
          padding: "6px 14px",
          borderRadius: "999px",
          backgroundColor: palette.secondary,
          color: palette.secondaryForeground,
          fontSize: "13px",
          lineHeight: "18px",
          fontWeight: 500,
        }}
      >
        {children}
      </span>
    </div>
  );
}

export function EmailButton({
  children,
  href,
  variant = "primary",
}: EmailButtonProps) {
  // Match web button styles: h-9 px-4 rounded-md shadow-md for primary
  const baseStyles = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: "36px",
    padding: "0 16px",
    borderRadius: "8px",
    fontSize: "14px",
    lineHeight: "20px",
    fontWeight: 500,
    textDecoration: "none",
    textAlign: "center" as const,
  };

  const variantStyles = {
    primary: {
      backgroundColor: palette.primary,
      color: palette.primaryForeground,
      boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)",
    },
    secondary: {
      backgroundColor: palette.secondary,
      color: palette.secondaryForeground,
    },
    outline: {
      backgroundColor: "transparent",
      color: palette.primary,
      border: `1px solid ${palette.border}`,
      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
    },
  };

  return (
    <a href={href} style={{ ...baseStyles, ...variantStyles[variant] }}>
      {children}
    </a>
  );
}

export function EmailDivider({ withPadding = false }: EmailDividerProps) {
  return (
    <div
      style={{
        height: "1px",
        backgroundColor: palette.border,
        margin: withPadding ? "16px 0" : undefined,
      }}
    />
  );
}

const iconMap = {
  calendar: CalendarIcon,
  clock: ClockIcon,
  mapPin: MapPinIcon,
  tag: TagIcon,
  fileText: FileTextIcon,
  timer: TimerIcon,
};

export function EmailDetailRow({ icon, label, children }: EmailDetailRowProps) {
  const IconComponent = iconMap[icon];

  return (
    <div style={{ display: "flex", gap: "12px", padding: "12px 0" }}>
      <div style={{ flexShrink: 0, width: "20px", paddingTop: "2px" }}>
        <IconComponent size={18} color={palette.mutedForeground} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: "12px",
            lineHeight: "16px",
            fontWeight: 500,
            color: palette.mutedForeground,
          }}
        >
          {label}
        </p>
        <p
          style={{
            margin: "2px 0 0",
            fontSize: "14px",
            lineHeight: "20px",
            color: palette.foreground,
          }}
        >
          {children}
        </p>
      </div>
    </div>
  );
}

export function EmailBadge({
  children,
  color,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 12px",
        borderRadius: "6px",
        backgroundColor: color || palette.primary,
        color: palette.primaryForeground,
        fontSize: "12px",
        lineHeight: "18px",
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  );
}

// Email header component for section titles
export function EmailHeader({
  children,
  subtitle,
}: {
  children: React.ReactNode;
  subtitle?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <h2
        style={{
          margin: 0,
          fontSize: "18px",
          lineHeight: "24px",
          fontWeight: 600,
          color: palette.foreground,
        }}
      >
        {children}
      </h2>
      {subtitle && (
        <p
          style={{
            margin: "4px 0 0",
            fontSize: "14px",
            lineHeight: "20px",
            color: palette.mutedForeground,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
