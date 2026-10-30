import { Lock, type LucideIcon } from "lucide-react";

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
  hasPasswordAccount,
  busy,
  formOpen,
  onOpenForm,
}: {
  hasPasswordAccount: boolean;
  busy: boolean;
  formOpen: boolean;
  onOpenForm: (form: NonNullable<SecurityForm>) => void;
}) {
  if (!hasPasswordAccount || formOpen) return null;

  return (
    <SecurityActionButton
      label="Change Password"
      description="Update your sign-in password. It also unlocks your encrypted data."
      icon={Lock}
      disabled={busy}
      onClick={() => onOpenForm("change-password")}
    />
  );
}
