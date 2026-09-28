import { useEffect, useMemo, useState } from "react";
import {
  Image,
  InteractionManager,
  PixelRatio,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Blobatar } from "@blobatar/react-native";
import { AnimatedBlobatar } from "@blobatar/react-native/animated";
import { isSolaceProfileAvatarUrl, resolveSolaceProfileAvatarUrl } from "@workspace/calendar-core";
import { useSolaceProfileImage } from "../hooks/use-solace-profile-image";
import { getAuthHeaders } from "../lib/api";
import { API_BASE_URL } from "../lib/constants";

/** Softer silhouettes; gaze biased right toward row content in LTR layouts. */
const EMAIL_BLOBATAR_TRAITS = {
  shape: [0.11, 0.35, 0.54, 0.933],
  "gaze.x": [0.72, 0.85, 0.95],
  "eye.lean": [0.6, 0.75, 0.9],
};

function blobatarName(
  email?: string | null,
  name?: string | null,
): string {
  return email?.trim() || name?.trim() || "unknown";
}

export function BlobatarAvatar({
  email,
  name,
  src,
  size,
  borderRadius,
  style,
  animate = false,
  onImageLoadedChange,
}: {
  email?: string | null;
  name?: string | null;
  src?: string | null;
  size: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  /** Idle motion. Off in lists/settings — the animated adapter writes shared values during render. */
  animate?: boolean;
  onImageLoadedChange?: (loaded: boolean) => void;
}) {
  const [failed, setFailed] = useState(false);
  const [idleReady, setIdleReady] = useState(false);
  const lookedUp = useSolaceProfileImage(email, { enabled: !src });
  const imageSrc = resolveSolaceProfileAvatarUrl(
    src || lookedUp,
    API_BASE_URL,
    PixelRatio.getPixelSizeForLayoutSize(size),
  );
  const seed = blobatarName(email, name);
  const radius = borderRadius ?? size / 2;

  useEffect(() => {
    setFailed(false);
  }, [imageSrc]);

  useEffect(() => {
    if (!animate) {
      return;
    }
    const task = InteractionManager.runAfterInteractions(() => {
      setIdleReady(true);
    });
    return () => task.cancel();
  }, [animate]);

  const boxStyle = [
    { width: size, height: size, borderRadius: radius, overflow: "hidden" as const },
    style,
  ];
  const label = name || email || "Avatar";
  const blobatarProps = {
    name: seed,
    size,
    traits: EMAIL_BLOBATAR_TRAITS,
    title: label,
  };
  const imageSource = useMemo(() => {
    if (!imageSrc) {
      return null;
    }

    if (isSolaceProfileAvatarUrl(imageSrc)) {
      return {
        uri: imageSrc,
        headers: getAuthHeaders(),
      };
    }

    return { uri: imageSrc };
  }, [imageSrc]);

  const showImage = imageSource && !failed;

  // The Blobatar stays underneath so loading or broken pictures never show an empty circle.
  return (
    <View style={boxStyle}>
      {animate && idleReady && !showImage ? (
        <AnimatedBlobatar {...blobatarProps} animate />
      ) : (
        <Blobatar {...blobatarProps} />
      )}
      {showImage ? (
        <Image
          source={imageSource}
          accessibilityLabel={label}
          onLoad={() => onImageLoadedChange?.(true)}
          onError={() => {
            setFailed(true);
            onImageLoadedChange?.(false);
          }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  );
}
