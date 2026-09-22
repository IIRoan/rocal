import { Shield, Users } from "lucide-react";

import { PaletteNavRow, PaletteSection } from "./palette-ui";

export function AccountMoreLinks({
  isBusy,
  onOpenSecurity,
  onOpenInvites,
}: {
  isBusy: boolean;
  onOpenSecurity?: () => void;
  onOpenInvites?: () => void;
}) {
  if (!onOpenInvites && !onOpenSecurity) return null;

  return (
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
  );
}
