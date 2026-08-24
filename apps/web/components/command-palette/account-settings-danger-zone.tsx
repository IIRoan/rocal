"use client";

import { useReducer } from "react";
import { AlertTriangle, Check, Loader2, RotateCcw, Trash2 } from "lucide-react";

import { AnimatedCollapse } from "./account-settings-shared";
import {
  dangerZoneUiReducer,
  initialDangerZoneUiState,
} from "./account-settings-ui-state";

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
    <>
      <div className="mt-1 border-t border-border/50 px-4 pb-1 pt-2 text-xs font-medium text-muted-foreground">
        Danger Zone
      </div>
      <div className="px-2 pb-4">
        <div style={{ display: confirmOpen ? "none" : undefined }}>
          <button
            type="button"
            onClick={() => dispatch({ type: "openResetConfirm" })}
            disabled={isBusy}
            className="flex w-full items-center gap-3 rounded-md p-2 text-left text-destructive transition-colors hover:bg-destructive/8 focus:bg-destructive/10 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="flex size-6 shrink-0 items-center justify-center">
              <RotateCcw className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm">Reset to Defaults</div>
              <div className="text-xs text-destructive/70">
                Restore preferences to their original values.
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "openDeleteConfirm" })}
            disabled={isBusy}
            className="flex w-full items-center gap-3 rounded-md p-2 text-left text-destructive transition-colors hover:bg-destructive/8 focus:bg-destructive/10 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="flex size-6 shrink-0 items-center justify-center">
              <Trash2 className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm">Delete Account</div>
              <div className="text-xs text-destructive/70">
                Permanently remove your account and all data.
              </div>
            </div>
          </button>
        </div>

        <AnimatedCollapse isOpen={dangerZone.showDeleteConfirm}>
          <div className="mx-1 my-1 rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-3">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              <span>
                This permanently deletes your account, calendars, events,
                categories, subscriptions, passkeys, and settings. This cannot be
                undone.
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  handleDeleteAccount();
                  dispatch({ type: "closeDeleteConfirm" });
                }}
                disabled={isBusy}
                className="inline-flex h-8 items-center gap-2 rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {deletingAccount ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Trash2 className="size-3" />
                )}
                Delete my account
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: "closeDeleteConfirm" })}
                className="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent/40"
              >
                Cancel
              </button>
            </div>
          </div>
        </AnimatedCollapse>

        <AnimatedCollapse isOpen={dangerZone.showResetConfirm}>
          <div className="mx-1 my-1 rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-3">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              <span>
                This will reset all settings to their default values. This
                cannot be undone.
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  handleReset();
                  dispatch({ type: "closeResetConfirm" });
                }}
                disabled={isBusy}
                className="inline-flex h-8 items-center gap-2 rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                <Check className="size-3" />
                Yes, reset everything
              </button>
              <button
                type="button"
                onClick={() => dispatch({ type: "closeResetConfirm" })}
                className="inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent/40"
              >
                Cancel
              </button>
            </div>
          </div>
        </AnimatedCollapse>
      </div>
    </>
  );
}
