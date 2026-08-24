import { useEffect, useMemo, useState } from "react";
import {
  Image,
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
}: {
  email?: string | null;
  name?: string | null;
  src?: string | null;
  size: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  /** Profile/sidebar only — keep false in mail lists. */
  animate?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = resolveSolaceProfileAvatarUrl(src, API_BASE_URL);
  const lookedUp = useSolaceProfileImage(email, { enabled: !resolvedSrc });
  const imageSrc = resolvedSrc || lookedUp;
  const seed = blobatarName(email, name);
  const radius = borderRadius ?? size / 2;

  useEffect(() => {
    setFailed(false);
  }, [imageSrc]);

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

  if (imageSource && !failed) {
    return (
      <Image
        source={imageSource}
        accessibilityLabel={label}
        onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }

  return (
    <View style={boxStyle}>
      {animate ? (
        <AnimatedBlobatar {...blobatarProps} animate />
      ) : (
        <Blobatar {...blobatarProps} />
      )}
    </View>
  );
}
