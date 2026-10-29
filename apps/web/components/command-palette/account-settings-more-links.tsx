import { HelpCircle, Shield, Users } from "lucide-react";
import Link from "next/link";
import { PRODUCT_ROUTES } from "@workspace/calendar-core/product-info";

import { PaletteNavRow, PaletteSection } from "./palette-ui";
import { PALETTE_ROW_CLASS } from "./palette-styles";

export function AccountMoreLinks({
  isBusy,
  onOpenSecurity,
  onOpenInvites,
}: {
  isBusy: boolean;
  onOpenSecurity?: () => void;
  onOpenInvites?: () => void;
}) {
  return (
    <>
      {onOpenSecurity || onOpenInvites ? (
        <PaletteSection label="More">
          {onOpenSecurity ? (
            <PaletteNavRow
              icon={Shield}
              label="Security"
              description="Passkeys & authentication"
              onClick={onOpenSecurity}
              disabled={isBusy}
            />
          ) : null}
          {onOpenInvites ? (
            <PaletteNavRow
              icon={Users}
              label="Invites"
              description="Invite friends to join Solace"
              onClick={onOpenInvites}
              disabled={isBusy}
            />
          ) : null}
        </PaletteSection>
      ) : null}
      <PaletteSection label="Help and privacy">
        <Link
          href={PRODUCT_ROUTES.support}
          target="_blank"
          rel="noopener noreferrer"
          className={PALETTE_ROW_CLASS}
        >
          <HelpCircle
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span>Support</span>
        </Link>
        <Link
          href={PRODUCT_ROUTES.privacy}
          target="_blank"
          rel="noopener noreferrer"
          className={PALETTE_ROW_CLASS}
        >
          <Shield
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span>Privacy policy</span>
        </Link>
      </PaletteSection>
    </>
  );
}
