import { Lock, RotateCcw, type LucideIcon } from "lucide-react";

import type { SecurityAccessKind } from "./account-settings-types";
import type { SecurityForm } from "./account-settings-ui-state";

function SecurityActionButton({
  title,
  description,
  icon: Icon,
  disabled,
  hidden,
  onClick,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  disabled: boolean;
  hidden: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-accent/50 focus:bg-accent/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      style={{ display: hidden ? "none" : undefined }}
    >
      <div className="flex size-6 shrink-0 items-center justify-center">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
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
        <div className="mx-1 mb-2 rounded-lg border border-border/50 bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
          OAuth and passkey sign-in use a separate encryption password.
          {accessKind === "oauth-only"
            ? " Setting an email password adds email sign-in to this account."
            : " Your email sign-in password stays separate from that encryption password."}{" "}
          Resetting the encryption password only replaces the password wrapper
          around your existing encryption keys; it does not change your OAuth
          sign-in method.
        </div>
      ) : null}

      {hasPasswordAccess ? (
        <SecurityActionButton
          title="Change Password"
          description="Update your email sign-in password. Solace also uses it for encryption after email sign-in."
          icon={Lock}
          disabled={disabled}
          hidden={formOpen}
          onClick={() => onOpenForm("change-password")}
        />
      ) : null}

      {accessKind === "oauth-only" ? (
        <SecurityActionButton
          title="Set Email Password"
          description="Add an email sign-in password to this account. This does not change the separate encryption password used by OAuth or passkey sign-in."
          icon={Lock}
          disabled={disabled}
          hidden={formOpen}
          onClick={() => onOpenForm("set-password")}
        />
      ) : null}

      {hasOAuthAccess ? (
        <SecurityActionButton
          title="Reset Encryption Password"
          description="Choose a new encryption password for OAuth or passkey sign-in. This keeps your encrypted data intact and only replaces the password used to unlock your keys on new devices."
          icon={RotateCcw}
          disabled={disabled}
          hidden={formOpen}
          onClick={() => onOpenForm("reset-encryption")}
        />
      ) : null}
    </>
  );
}
