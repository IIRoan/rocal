import { FileText, HelpCircle, Shield, Users } from "lucide-react";
import Link from "next/link";
import { PRODUCT_ROUTES } from "@workspace/calendar-core/product-info";

import { PaletteIconBox, PaletteNavRow, PaletteSection } from "./palette-ui";
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
          <PaletteIconBox>
            <HelpCircle className="size-4" aria-hidden="true" />
          </PaletteIconBox>
          <span className="flex-1 truncate text-[15px] leading-[130%] text-foreground">
            Support
          </span>
        </Link>
        <Link
          href={PRODUCT_ROUTES.privacy}
          target="_blank"
          rel="noopener noreferrer"
          className={PALETTE_ROW_CLASS}
        >
          <PaletteIconBox>
            <Shield className="size-4" aria-hidden="true" />
          </PaletteIconBox>
          <span className="flex-1 truncate text-[15px] leading-[130%] text-foreground">
            Privacy policy
          </span>
        </Link>
        <Link
          href={PRODUCT_ROUTES.licenses}
          target="_blank"
          rel="noopener noreferrer"
          className={PALETTE_ROW_CLASS}
        >
          <PaletteIconBox>
            <FileText className="size-4" aria-hidden="true" />
          </PaletteIconBox>
          <span className="flex-1 truncate text-[15px] leading-[130%] text-foreground">
            Open source licenses
          </span>
        </Link>
      </PaletteSection>
    </>
  );
}
