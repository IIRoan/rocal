import { Lock, RotateCcw, type LucideIcon } from "lucide-react";

import type { SecurityAccessKind } from "./account-settings-types";
import type { SecurityForm } from "./account-settings-ui-state";
import {
  PaletteIconBox,
} from "./palette-ui";
import { PALETTE_ROW_CLASS } from "./palette-styles";

function SecurityActionButton({
  label,
  description,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string;
  description: string;
  icon: LucideIcon;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={PALETTE_ROW_CLASS}
    >
      <PaletteIconBox>
        <Icon className="size-4" />
      </PaletteIconBox>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] leading-[130%] text-foreground">
          {label}
        </span>
        <span className="text-[13px] leading-[130%] text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  );
}

export function AccountSecurityActions({
  accessKind,
  busy,
  formOpen,
  onOpenForm,
}: {
  accessKind: SecurityAccessKind;
  busy: boolean;
  formOpen: boolean;
  onOpenForm: (form: NonNullable<SecurityForm>) => void;
}) {
  const disabled = busy || formOpen;
  const hasOAuthAccess =
    accessKind === "oauth-only" || accessKind === "oauth-and-password";
  const hasPasswordAccess =
    accessKind === "password" || accessKind === "oauth-and-password";

  return (
    <>
      {hasOAuthAccess ? (
        <div className="p-2 text-[13px] leading-[130%] text-muted-foreground">
          OAuth and passkey sign-in use a separate encryption password.
          {accessKind === "oauth-only"
            ? " Setting an email password adds email sign-in to this account."
            : " Your email sign-in password stays separate from that encryption password."}{" "}
          Resetting the encryption password only replaces the password wrapper
          around your existing encryption keys; it does not change your OAuth
          sign-in method.
        </div>
      ) : null}

      {hasPasswordAccess && !formOpen ? (
        <SecurityActionButton
          label="Change Password"
          description="Update your email sign-in password. Solace also uses it for encryption after email sign-in."
          icon={Lock}
          disabled={disabled}
          onClick={() => onOpenForm("change-password")}
        />
      ) : null}

      {accessKind === "oauth-only" && !formOpen ? (
        <SecurityActionButton
          label="Set Email Password"
          description="Add an email sign-in password to this account. This does not change the separate encryption password used by OAuth or passkey sign-in."
          icon={Lock}
          disabled={disabled}
          onClick={() => onOpenForm("set-password")}
        />
      ) : null}

      {hasOAuthAccess && !formOpen ? (
        <SecurityActionButton
          label="Reset Encryption Password"
          description="Choose a new encryption password for OAuth or passkey sign-in. This keeps your encrypted data intact and only replaces the password used to unlock your keys on new devices."
          icon={RotateCcw}
          disabled={disabled}
          onClick={() => onOpenForm("reset-encryption")}
        />
      ) : null}
    </>
  );
}
