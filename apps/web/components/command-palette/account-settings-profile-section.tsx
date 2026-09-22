"use client";

import { useReducer } from "react";
import { Check, ImageIcon, Pencil, X } from "lucide-react";

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
import {
  PaletteButton,
} from "./palette-ui";
import { PALETTE_INPUT_CLASS } from "./palette-styles";

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
    <div className="pb-2">
      <div className="flex items-center gap-3 p-2">
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
              <p className="truncate text-[15px] font-[470] text-foreground">
                {displayName ?? displayEmail ?? "Solace account"}
              </p>
              {displayEmail ? (
                <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                  {displayEmail}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {profile.message && !profile.showAvatarForm ? (
        <div className="px-2 py-1">
          <InlineMessage msg={profile.message} />
        </div>
      ) : null}

      <AnimatedCollapse
        isOpen={profile.showAvatarForm && !!handleUpdateProfile}
      >
        <div className="p-2">
          <p className="mb-2 text-[13px] leading-[130%] text-muted-foreground">
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
                className={`${PALETTE_INPUT_CLASS} pl-8`}
              />
            </div>
            <PaletteButton
              variant="primary"
              onClick={() => void handleAvatarSave()}
              loading={updatingProfile}
              className="h-9"
            >
              {updatingProfile ? null : <Check className="size-3.5" />}
              Save
            </PaletteButton>
            <PaletteButton
              variant="ghost"
              onClick={() => dispatch({ type: "closeAvatarForm" })}
              disabled={updatingProfile}
              className="size-9 px-0"
              aria-label="Cancel"
            >
              <X className="size-3.5" />
            </PaletteButton>
          </div>
          {profile.message?.kind === "error" ? (
            <p className="mt-2 text-[13px] text-destructive" role="alert">
              {profile.message.text}
            </p>
          ) : null}
        </div>
      </AnimatedCollapse>
    </div>
  );
}
