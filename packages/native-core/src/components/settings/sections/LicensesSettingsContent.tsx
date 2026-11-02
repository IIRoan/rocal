import React, { useState } from "react";
import { StyleSheet, Text, type TextStyle } from "react-native";
import type { ThemeTokens } from "@workspace/design-tokens";
import {
  PRODUCT_LICENSE_NOTICE,
  PRODUCT_SOURCE_URL,
} from "@workspace/calendar-core/product-info";
import {
  THIRD_PARTY_LICENSE_GROUPS,
  licenseGroupCount,
  licenseGroupKey,
  type ThirdPartyLicenseGroup,
} from "@workspace/calendar-core/third-party-notices";
import { openExternalLink } from "../../../lib/open-external-link";
import { useTheme } from "../../../providers/ThemeProvider";
import { SettingsPage } from "../SettingsPage";
import {
  SheetGroup,
  SheetGroupBlock,
  SheetItem,
  SheetScroll,
  SheetSection,
} from "../../sheet/SheetSections";

/** One text block per group, so the 800-package MIT group stays a single native view. */
function packageCredits(group: ThirdPartyLicenseGroup): string {
  return group.packages
    .map((pkg) =>
      [`${pkg.name} ${pkg.version}`, ...pkg.copyright, pkg.notice]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

export function LicensesSettingsContent() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <SettingsPage title="Open source licenses">
      <SheetScroll>
        <SheetSection title="Solace" footer={PRODUCT_LICENSE_NOTICE}>
          <SheetGroup>
            <SheetItem
              label="Source code"
              icon="code"
              accessory="external-link"
              accessibilityRole="link"
              onPress={() => openExternalLink(PRODUCT_SOURCE_URL)}
            />
          </SheetGroup>
        </SheetSection>
        <SheetSection
          title="Third-party software"
          footer="Packages that share a license text are grouped."
        >
          <SheetGroup>
            {THIRD_PARTY_LICENSE_GROUPS.flatMap((group) => {
              const key = licenseGroupKey(group);
              const open = openKey === key;
              const row = (
                <SheetItem
                  key={key}
                  label={group.license}
                  detail={licenseGroupCount(group)}
                  accessory={open ? "chevron-up" : "chevron-down"}
                  accessibilityState={{ expanded: open }}
                  onPress={() => setOpenKey(open ? null : key)}
                />
              );
              if (!open) return [row];
              return [
                row,
                <SheetGroupBlock key={`${key}:text`}>
                  <Text style={styles.credits}>{packageCredits(group)}</Text>
                  {group.text ? (
                    <Text style={styles.license}>{group.text}</Text>
                  ) : null}
                </SheetGroupBlock>,
              ];
            })}
          </SheetGroup>
        </SheetSection>
      </SheetScroll>
    </SettingsPage>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    credits: {
      color: theme.colors.foreground,
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
    } as TextStyle,
    license: {
      marginTop: theme.spacing["4"],
      color: theme.colors.mutedForeground,
      fontSize: theme.typography.fontSize.xs.size,
      lineHeight: theme.typography.fontSize.xs.lineHeight,
    } as TextStyle,
  });
}
