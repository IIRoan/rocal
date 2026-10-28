import { productLinks } from "@workspace/calendar-core/product-info";
import { APP_BASE_URL } from "../../lib/constants";
import { openExternalLink } from "../../lib/open-external-link";
import { SheetGroup, SheetItem, SheetSection } from "../sheet/SheetSections";

export function AppInformationSettingsSection() {
  const links = productLinks(APP_BASE_URL);
  if (!links.privacy || !links.support) return null;
  const privacy = links.privacy;
  const support = links.support;
  const contact = links.contact;
  return (
    <SheetSection title="Help and privacy">
      <SheetGroup>
        <SheetItem
          label="Privacy policy"
          icon="shield"
          accessory="external-link"
          accessibilityRole="link"
          onPress={() => openExternalLink(privacy)}
        />
        <SheetItem
          label="Support"
          icon="help-circle"
          accessory="external-link"
          accessibilityRole="link"
          onPress={() => openExternalLink(support)}
        />
        {contact ? (
          <SheetItem
            label="Contact support"
            icon="mail"
            accessory="external-link"
            accessibilityRole="link"
            onPress={() => openExternalLink(contact)}
          />
        ) : null}
      </SheetGroup>
    </SheetSection>
  );
}
