"use client";

import {
  MAIL_SETTINGS_NAV_ITEMS,
  type MailSettingsView,
} from "./mail-settings-navigation";
import { PaletteNavRow, PaletteView } from "../command-palette/palette-ui";

export function MailSettingsHub({
  goBack,
  onNavigate,
}: {
  goBack: () => void;
  onNavigate: (view: MailSettingsView) => void;
}) {
  return (
    <PaletteView title="Mail settings" onBack={goBack}>
      {MAIL_SETTINGS_NAV_ITEMS.map((item) => (
        <PaletteNavRow
          key={item.id}
          icon={item.icon}
          label={item.label}
          description={item.description}
          onClick={() => onNavigate(item.id)}
        />
      ))}
    </PaletteView>
  );
}
