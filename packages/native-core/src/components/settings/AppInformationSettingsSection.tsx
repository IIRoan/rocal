import { productLinks } from "@workspace/calendar-core/product-info";
import { APP_BASE_URL } from "../../lib/constants";
import { SETTINGS_LICENSES_ROUTE } from "../../lib/navigation-routes";
import { openExternalLink } from "../../lib/open-external-link";
import { SheetGroup, SheetItem, SheetSection } from "../sheet/SheetSections";
import { useSettingsNavigator } from "./SettingsPage";

export function AppInformationSettingsSection() {
  const navigate = useSettingsNavigator();
  const { privacy, support, contact } = productLinks(APP_BASE_URL);
  return (
    <SheetSection title="Help and privacy">
      <SheetGroup>
        {privacy ? (
          <SheetItem
            label="Privacy policy"
            icon="shield"
            accessory="external-link"
            accessibilityRole="link"
            onPress={() => openExternalLink(privacy)}
          />
        ) : null}
        {support ? (
          <SheetItem
            label="Support"
            icon="help-circle"
            accessory="external-link"
            accessibilityRole="link"
            onPress={() => openExternalLink(support)}
          />
        ) : null}
        {contact && support ? (
          <SheetItem
            label="Contact support"
            icon="mail"
            accessory="external-link"
            accessibilityRole="link"
            onPress={() => openExternalLink(contact)}
          />
        ) : null}
        <SheetItem
          label="Open source licenses"
          icon="file-text"
          chevron
          onPress={() => navigate(SETTINGS_LICENSES_ROUTE)}
        />
      </SheetGroup>
    </SheetSection>
  );
}
