"use client";

import { useReducer, type ReactNode } from "react";
import { AlertTriangle, Check, RotateCcw, Trash2 } from "lucide-react";

import { AnimatedCollapse } from "./account-settings-shared";
import {
  dangerZoneUiReducer,
  initialDangerZoneUiState,
} from "./account-settings-ui-state";
import {
  PaletteButton,
  PaletteFormActions,
  PaletteIconBox,
  PaletteNavRow,
  PaletteSection,
} from "./palette-ui";

export function AccountDangerZone({
  isBusy,
  deletingAccount,
  handleReset,
  handleDeleteAccount,
}: {
  isBusy: boolean;
  deletingAccount: boolean;
  handleReset: () => void;
  handleDeleteAccount: () => void;
}) {
  const [dangerZone, dispatch] = useReducer(
    dangerZoneUiReducer,
    initialDangerZoneUiState,
  );

  const confirmOpen =
    dangerZone.showResetConfirm || dangerZone.showDeleteConfirm;

  return (
    <PaletteSection label="Danger Zone">
      {confirmOpen ? null : (
        <>
          <PaletteNavRow
            icon={RotateCcw}
            label={<span className="text-destructive">Reset to Defaults</span>}
            description="Restore preferences to their original values."
            trailing={null}
            onClick={() => dispatch({ type: "openResetConfirm" })}
            disabled={isBusy}
          />
          <PaletteNavRow
            icon={Trash2}
            label={<span className="text-destructive">Delete Account</span>}
            description="Permanently remove your account and all data."
            trailing={null}
            onClick={() => dispatch({ type: "openDeleteConfirm" })}
            disabled={isBusy}
          />
        </>
      )}

      <AnimatedCollapse isOpen={dangerZone.showDeleteConfirm}>
        <ConfirmPanel
          message="This permanently deletes your account, calendars, events, categories, subscriptions, passkeys, and settings. This cannot be undone."
          onCancel={() => dispatch({ type: "closeDeleteConfirm" })}
        >
          <PaletteButton
            variant="destructive"
            loading={deletingAccount}
            disabled={isBusy}
            onClick={() => {
              handleDeleteAccount();
              dispatch({ type: "closeDeleteConfirm" });
            }}
          >
            {deletingAccount ? null : <Trash2 className="size-3.5" />}
            Delete my account
          </PaletteButton>
        </ConfirmPanel>
      </AnimatedCollapse>

      <AnimatedCollapse isOpen={dangerZone.showResetConfirm}>
        <ConfirmPanel
          message="This will reset all settings to their default values. This cannot be undone."
          onCancel={() => dispatch({ type: "closeResetConfirm" })}
        >
          <PaletteButton
            variant="destructive"
            disabled={isBusy}
            onClick={() => {
              handleReset();
              dispatch({ type: "closeResetConfirm" });
            }}
          >
            <Check className="size-3.5" />
            Yes, reset everything
          </PaletteButton>
        </ConfirmPanel>
      </AnimatedCollapse>
    </PaletteSection>
  );
}

function ConfirmPanel({
  message,
  onCancel,
  children,
}: {
  message: string;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-start gap-3 p-2 text-[13px] leading-[130%] text-muted-foreground">
        <PaletteIconBox>
          <AlertTriangle className="size-4 text-destructive" />
        </PaletteIconBox>
        <span>{message}</span>
      </div>
      <PaletteFormActions>
        <PaletteButton variant="ghost" onClick={onCancel}>
          Cancel
        </PaletteButton>
        {children}
      </PaletteFormActions>
    </div>
  );
}
