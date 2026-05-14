import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockRedirect = jest.fn();

jest.mock("next/navigation", () => ({
  redirect: (href: string) => mockRedirect(href),
}));

import SettingsPage from "../../app/settings/page";

describe("SettingsPage", () => {
  beforeEach(() => {
    mockRedirect.mockReset();
  });

  it("redirects the settings shortcut into the calendar palette", () => {
    SettingsPage();

    expect(mockRedirect).toHaveBeenCalledWith("/calendar?palette=settings");
  });
});