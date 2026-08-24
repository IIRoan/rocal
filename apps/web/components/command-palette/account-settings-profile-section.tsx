"use client";

import { useReducer } from "react";
import { Check, ImageIcon, Loader2, Pencil, X } from "lucide-react";

import {
  AccountAvatar,
  AnimatedCollapse,
  InlineMessage,
} from "./account-settings-shared";
import { getAccountSettingsErrorMessage } from "./account-settings-utils";
import {
  createInitialProfileUiState,
  profileUiReducer,
} from "./account-settings-ui-state";

export function AccountProfileSection({
  displayName,
  displayEmail,
  accountImage,
  sessionLoading,
  updatingProfile,
  handleUpdateProfile,
}: {
  displayName: string | null;
  displayEmail: string | null;
  accountImage?: string | null;
  sessionLoading: boolean;
  updatingProfile: boolean;
  handleUpdateProfile?: (values: { imageUrl?: string }) => Promise<void>;
}) {
  const [profile, dispatch] = useReducer(
    profileUiReducer,
    accountImage,
    createInitialProfileUiState,
  );

  const handleAvatarSave = async () => {
    if (!handleUpdateProfile) return;
    dispatch({ type: "setMessage", message: null });
    try {
      await handleUpdateProfile({ imageUrl: profile.avatarUrl.trim() });
      dispatch({ type: "closeAvatarForm" });
      dispatch({
        type: "setMessage",
        message: { kind: "success", text: "Profile picture updated." },
      });
    } catch (error) {
      dispatch({
        type: "setMessage",
        message: { kind: "error", text: getAccountSettingsErrorMessage(error) },
      });
    }
  };

  return (
    <div className="px-4 pt-3 pb-1">
      <div className="flex items-center gap-3 py-1">
        <div className="relative shrink-0">
          <AccountAvatar
            name={displayName}
            email={displayEmail}
            imageUrl={accountImage}
            size="lg"
          />
          {handleUpdateProfile ? (
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: "toggleAvatarForm",
                  imageUrl: accountImage ?? "",
                })
              }
              className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border border-border bg-background shadow-sm transition-colors hover:bg-accent"
              aria-label="Change profile picture"
            >
              <Pencil className="size-2.5 text-muted-foreground" />
            </button>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          {sessionLoading ? (
            <div className="space-y-1.5">
              <div className="h-4 w-28 animate-pulse rounded bg-muted" />
              <div className="h-3 w-40 animate-pulse rounded bg-muted" />
            </div>
          ) : (
            <>
              <p className="truncate text-sm font-medium text-foreground">
                {displayName ?? displayEmail ?? "Solace account"}
              </p>
              {displayEmail ? (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {displayEmail}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {profile.message && !profile.showAvatarForm ? (
        <div className="mt-2">
          <InlineMessage msg={profile.message} />
        </div>
      ) : null}

      <AnimatedCollapse isOpen={profile.showAvatarForm && !!handleUpdateProfile}>
        <div className="mt-2 mb-1 rounded-lg border border-border/50 bg-muted/30 p-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Paste the URL of any publicly accessible image.
          </p>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <ImageIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
              <input
                type="url"
                value={profile.avatarUrl}
                onChange={(event) =>
                  dispatch({ type: "setAvatarUrl", value: event.target.value })
                }
                placeholder="https://example.com/avatar.png"
                aria-label="Avatar URL"
                disabled={updatingProfile}
                className="flex h-9 w-full rounded-md bg-input pl-8 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <button
              type="button"
              onClick={() => void handleAvatarSave()}
              disabled={updatingProfile}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {updatingProfile ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Check className="size-3" />
              )}
              Save
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: "closeAvatarForm" })}
              disabled={updatingProfile}
              className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent/50 disabled:opacity-60"
              aria-label="Cancel"
            >
              <X className="size-3.5" />
            </button>
          </div>
          {profile.message?.kind === "error" ? (
            <p className="mt-2 text-xs text-destructive" role="alert">
              {profile.message.text}
            </p>
          ) : null}
        </div>
      </AnimatedCollapse>
    </div>
  );
}
