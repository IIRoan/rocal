/** @jest-environment jsdom */

import React from "react";
import { describe, expect, it, jest } from "@jest/globals";
import { renderToStaticMarkup } from "react-dom/server.node";

jest.mock("lucide-react", () => {
  const Icon = () => null;

  return {
    ArrowLeft: Icon,
    Bell: Icon,
    ChevronRight: Icon,
    Key: Icon,
    Mail: Icon,
    Send: Icon,
    Shield: Icon,
    Smartphone: Icon,
  };
});

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("../../lib/calendar-api-service", () => ({
  calendarApiService: {
    sendTestPushNotification: jest.fn(async () => ({
      success: true,
      jobId: "job-1",
    })),
    listPushDevices: jest.fn(async () => ({ devices: [] })),
  },
}));

import {
  SOLACE_IOS_PRODUCTION_BUNDLE_ID,
} from "@workspace/calendar-core";
import { NotificationSettingsView } from "../../components/command-palette/notification-settings";
import { SecuritySettings } from "../../components/command-palette/security-settings";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("settings toggle rows", () => {
  it("renders security encryption as informational text without a toggle", () => {
    const html = renderToStaticMarkup(
      <SecuritySettings
        localSettings={{ eventEncryptionMode: "hybrid" } as any}
        updateSetting={jest.fn()}
        goBack={() => {}}
        goForward={() => {}}
      />,
    );

    expect(html).toContain("Event Encryption");
    expect(html).toContain("ciphertext-only");
    expect(html).not.toContain("Full Event Encryption");
  });

  it("renders email and app toggles plus registered devices", () => {
    const html = renderToStaticMarkup(
      <NotificationSettingsView
        localSettings={
          {
            emailNotifications: true,
            pushNotifications: true,
            eventEncryptionMode: "hybrid",
          } as any
        }
        updateSetting={jest.fn()}
        goBack={() => {}}
        isSendingTest={false}
        onSendTest={() => {}}
        devices={[
          {
            id: "dev-1",
            platform: "ios",
            bundleId: SOLACE_IOS_PRODUCTION_BUNDLE_ID,
            environment: "production",
            isEnabled: true,
            lastSeenAt: "2026-08-26T10:00:00.000Z",
            createdAt: "2026-08-01T10:00:00.000Z",
          },
        ]}
        devicesLoading={false}
        devicesError={false}
      />,
    );

    expect(html).toContain("Email reminders");
    expect(html).toContain("App notifications");
    expect(html).toContain("Mail");
    expect(html).toContain("iPhone");
    expect(html).toContain("Send test notification");
    expect(html).toContain("Devices");
    expect(html).toContain("Last seen");
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
  });
});
