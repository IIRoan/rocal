"use client";

import { useReducer, useRef, useState } from "react";
import { Pencil, Plus, Trash2, Upload, X } from "lucide-react";

import {
  AccountAvatar,
  AnimatedCollapse,
  InlineMessage,
} from "./account-settings-shared";
import { getAccountSettingsErrorMessage } from "./account-settings-utils";
import {
  initialProfileUiState,
  profileUiReducer,
} from "./account-settings-ui-state";
import { AvatarCropper } from "./avatar-cropper";
import { PaletteButton } from "./palette-ui";
import { resolveAvatarUrl } from "@/lib/profile-picture";

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
  handleUpdateProfile?: (values: { image: string | null }) => Promise<void>;
}) {
  const [profile, dispatch] = useReducer(profileUiReducer, initialProfileUiState);
  const [pendingImage, setPendingImage] = useState<ImageBitmap | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // A broken or still-loading picture shows the Blobatar, so treat it as no picture.
  const hasPicture = Boolean(accountImage) && imageLoaded;
  const editing =
    Boolean(pendingImage) || (profile.showAvatarForm && hasPicture);
  const choosePhoto = () => fileInputRef.current?.click();

  const discardPendingImage = () => {
    pendingImage?.close();
    setPendingImage(null);
  };

  const closeForm = () => {
    discardPendingImage();
    dispatch({ type: "closeAvatarForm" });
  };

  const openImage = async (file: File) => {
    dispatch({ type: "setMessage", message: null });
    try {
      setPendingImage(await createImageBitmap(file));
    } catch {
      dispatch({
        type: "setMessage",
        message: {
          kind: "error",
          text: "This image couldn't be opened. Try a JPEG, PNG or WebP.",
        },
      });
    }
  };

  const handleAvatarSave = async (image: string | null) => {
    if (!handleUpdateProfile) return;
    dispatch({ type: "setMessage", message: null });
    try {
      await handleUpdateProfile({ image });
      closeForm();
      dispatch({
        type: "setMessage",
        message: {
          kind: "success",
          text: image ? "Profile picture updated." : "Profile picture removed.",
        },
      });
    } catch (error) {
      dispatch({
        type: "setMessage",
        message: { kind: "error", text: getAccountSettingsErrorMessage(error) },
      });
    }
  };

  const avatar = (
    <AccountAvatar
      name={displayName}
      email={displayEmail}
      imageUrl={resolveAvatarUrl(accountImage)}
      size="lg"
      onImageLoadedChange={setImageLoaded}
    />
  );

  return (
    <div className="pb-2">
      <div className="flex items-center gap-3 p-2">
        {handleUpdateProfile ? (
          <button
            type="button"
            onClick={() => {
              if (editing) closeForm();
              else if (hasPicture) dispatch({ type: "toggleAvatarForm" });
              else choosePhoto();
            }}
            disabled={updatingProfile}
            className="group relative shrink-0 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-default"
            aria-label={
              hasPicture ? "Change profile picture" : "Add profile picture"
            }
            aria-expanded={editing}
          >
            {avatar}
            <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border border-border bg-background shadow-sm transition-colors group-hover:bg-accent">
              {hasPicture ? (
                <Pencil className="size-2.5 text-muted-foreground" />
              ) : (
                <Plus className="size-3 text-muted-foreground" />
              )}
            </span>
          </button>
        ) : (
          <div className="shrink-0">{avatar}</div>
        )}
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

      {handleUpdateProfile ? (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void openImage(file);
          }}
        />
      ) : null}

      {profile.message && !editing ? (
        <div className="px-2 py-1">
          <InlineMessage msg={profile.message} />
        </div>
      ) : null}

      <AnimatedCollapse isOpen={editing && !!handleUpdateProfile}>
        <div className="p-2">
          {pendingImage ? (
            <>
              <AvatarCropper
                image={pendingImage}
                saving={updatingProfile}
                onCancel={discardPendingImage}
                onSave={(image) => void handleAvatarSave(image)}
              />
              <p className="mt-2 text-center text-[12px] leading-[130%] text-muted-foreground">
                Drag to move, scroll to zoom. Only signed-in Solace users can
                see your photo.
              </p>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <PaletteButton
                variant="primary"
                onClick={choosePhoto}
                disabled={updatingProfile}
                className="h-9 flex-1"
              >
                <Upload className="size-3.5" />
                Change photo
              </PaletteButton>
              <PaletteButton
                variant="ghost"
                onClick={() => void handleAvatarSave(null)}
                loading={updatingProfile}
                className="h-9"
              >
                {updatingProfile ? null : <Trash2 className="size-3.5" />}
                Remove
              </PaletteButton>
              <PaletteButton
                variant="ghost"
                onClick={closeForm}
                disabled={updatingProfile}
                className="size-9 px-0"
                aria-label="Cancel"
              >
                <X className="size-3.5" />
              </PaletteButton>
            </div>
          )}
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
