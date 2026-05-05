import React, { useState } from "react";
import {
  RotateCcw,
  Check,
  X,
  ArrowLeft,
  AlertTriangle,
  Trash2,
} from "lucide-react";

interface AccountSettingsProps {
  goBack: () => void;
  saving: boolean;
  handleReset: () => void;
  deletingAccount: boolean;
  handleDeleteAccount: () => void;
}

export function AccountSettings({
  goBack,
  saving,
  handleReset,
  deletingAccount,
  handleDeleteAccount,
}: AccountSettingsProps) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isBusy = saving || deletingAccount;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-12 border-b border-border/50 shrink-0">
        <button
          onClick={() => goBack()}
          className="p-1 rounded hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium">Account</span>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 p-1">
              {!showResetConfirm && !showDeleteConfirm ? (
                <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
                  Danger Zone
                </div>
              ) : null}

              {!showResetConfirm ? (
                !showDeleteConfirm ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowResetConfirm(true)}
                      disabled={isBusy}
                      className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-destructive/5 focus:bg-destructive/10 focus:outline-none transition-colors text-destructive"
                    >
                      <RotateCcw className="h-4 w-4 shrink-0" />
                      <span className="text-sm">Reset to Defaults</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={isBusy}
                      className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-destructive/5 focus:bg-destructive/10 focus:outline-none transition-colors text-destructive"
                    >
                      <Trash2 className="h-4 w-4 shrink-0" />
                      <span className="text-sm">Delete Account</span>
                    </button>
                  </>
                ) : (
                  <div className="p-1">
                    <div className="flex items-start gap-3 px-3 py-3 text-xs text-muted-foreground">
                      <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                      <div>
                        This permanently deletes your account, calendars, events,
                        categories, subscriptions, passkeys, and settings. This
                        action cannot be undone.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleDeleteAccount();
                        setShowDeleteConfirm(false);
                      }}
                      disabled={isBusy}
                      className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-destructive/10 focus:bg-destructive/15 focus:outline-none transition-colors text-destructive"
                    >
                      <Trash2 className="h-4 w-4 shrink-0" />
                      <span className="text-sm">Yes, Delete My Account</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
                    >
                      <X className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm">Cancel</span>
                    </button>
                  </div>
                )
              ) : (
                <div className="p-1">
                  <div className="flex items-start gap-3 px-3 py-3 text-xs text-muted-foreground">
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <div>
                      This will reset all your settings to their default values.
                      This action cannot be undone.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleReset();
                      setShowResetConfirm(false);
                    }}
                    disabled={isBusy}
                    className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-destructive/10 focus:bg-destructive/15 focus:outline-none transition-colors text-destructive"
                  >
                    <Check className="h-4 w-4 shrink-0" />
                    <span className="text-sm">Yes, Reset Everything</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(false)}
                    className="flex items-center gap-3 px-3 py-2 w-full rounded-md text-left hover:bg-accent/30 focus:bg-accent/50 focus:outline-none transition-colors"
                  >
                    <X className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm">Cancel</span>
                  </button>
                </div>
              )}
      </div>
    </div>
  );
}
