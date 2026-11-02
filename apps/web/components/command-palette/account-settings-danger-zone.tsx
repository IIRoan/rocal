"use client";

import { useId, useReducer, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Check, RotateCcw, Trash2 } from "lucide-react";

import { AnimatedCollapse } from "@workspace/ui/components/ui/animated-collapse";
import {
  dangerZoneUiReducer,
  initialDangerZoneUiState,
} from "./account-settings-ui-state";
import {
  PaletteButton,
  PaletteField,
  PaletteFormActions,
  PaletteIconBox,
  PaletteNavRow,
  PaletteSection,
} from "./palette-ui";
import { PALETTE_INPUT_CLASS } from "./palette-styles";

export function AccountDangerZone({
  isBusy,
  deletingAccount,
  accountEmail,
  handleReset,
  handleDeleteAccount,
}: {
  isBusy: boolean;
  deletingAccount: boolean;
  accountEmail: string | null;
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
        <DeleteAccountConfirm
          isBusy={isBusy}
          deletingAccount={deletingAccount}
          accountEmail={accountEmail}
          onCancel={() => dispatch({ type: "closeDeleteConfirm" })}
          onConfirm={() => {
            handleDeleteAccount();
            dispatch({ type: "closeDeleteConfirm" });
          }}
        />
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
            Reset all settings
          </PaletteButton>
        </ConfirmPanel>
      </AnimatedCollapse>
    </PaletteSection>
  );
}

function DeleteAccountConfirm({
  isBusy,
  deletingAccount,
  accountEmail,
  onCancel,
  onConfirm,
}: {
  isBusy: boolean;
  deletingAccount: boolean;
  accountEmail: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const fieldId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [typedEmail, setTypedEmail] = useState("");
  const [error, setError] = useState<string>();
  const errorId = `${fieldId}-error`;
  const label = "Type your email to confirm";

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const expected = accountEmail?.trim().toLowerCase();
        if (!expected || typedEmail.trim().toLowerCase() !== expected) {
          setError(
            `That doesn’t match. Type ${accountEmail ?? "your account email"} to delete your account.`,
          );
          inputRef.current?.focus();
          return;
        }
        onConfirm();
      }}
    >
      <ConfirmPanel
        message="This permanently deletes your account, mailbox and all its mail, calendars, events, categories, subscriptions, passkeys, and settings. This cannot be undone."
        onCancel={onCancel}
        field={
          <PaletteField label={label} htmlFor={fieldId}>
            <input
              ref={inputRef}
              id={fieldId}
              aria-label={label}
              type="email"
              value={typedEmail}
              onChange={(e) => {
                setTypedEmail(e.target.value);
                setError(undefined);
              }}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              disabled={deletingAccount}
              className={PALETTE_INPUT_CLASS}
            />
            {error ? (
              <p id={errorId} className="text-[13px] text-destructive">
                {error}
              </p>
            ) : null}
          </PaletteField>
        }
      >
        <PaletteButton
          type="submit"
          variant="destructive"
          loading={deletingAccount}
          disabled={isBusy}
        >
          {deletingAccount ? null : <Trash2 className="size-3.5" />}
          Delete my account
        </PaletteButton>
      </ConfirmPanel>
    </form>
  );
}

function ConfirmPanel({
  message,
  field,
  onCancel,
  children,
}: {
  message: string;
  field?: ReactNode;
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
      {field}
      <PaletteFormActions>
        {/* Opening the panel unmounts its trigger, so focus lands on the safe choice. */}
        <PaletteButton variant="ghost" onClick={onCancel} autoFocus>
          Cancel
        </PaletteButton>
        {children}
      </PaletteFormActions>
    </div>
  );
}
