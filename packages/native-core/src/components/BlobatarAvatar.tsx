import { useMemo, useState } from "react";
import {
  Image,
  PixelRatio,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Blobatar } from "@blobatar/react-native";
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
  onImageLoadedChange,
}: {
  email?: string | null;
  name?: string | null;
  src?: string | null;
  size: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  onImageLoadedChange?: (loaded: boolean) => void;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const lookedUp = useSolaceProfileImage(email, { enabled: !src });
  const imageSrc = resolveSolaceProfileAvatarUrl(
    src || lookedUp,
    API_BASE_URL,
    PixelRatio.getPixelSizeForLayoutSize(size),
  );
  const seed = blobatarName(email, name);
  const radius = borderRadius ?? size / 2;

  const boxStyle = [
    { width: size, height: size, borderRadius: radius, overflow: "hidden" as const },
    style,
  ];
  const label = name || email || "Avatar";
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

  // A failure only applies to the src that failed, so a new src starts clean without an effect.
  const failed = imageSrc !== null && failedSrc === imageSrc;
  const showImage = imageSource && !failed;

  // The Blobatar stays underneath so loading or broken pictures never show an empty circle.
  return (
    <View style={boxStyle}>
      <Blobatar
        name={seed}
        size={size}
        traits={EMAIL_BLOBATAR_TRAITS}
        title={label}
      />
      {showImage ? (
        <Image
          source={imageSource}
          accessibilityLabel={label}
          onLoad={() => onImageLoadedChange?.(true)}
          onError={() => {
            setFailedSrc(imageSrc);
            onImageLoadedChange?.(false);
          }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  );
}
