type EasBuildProfile = {
  channel: string | undefined;
  environment: string | undefined;
  env: Record<string, string>;
};

/** Reject invalid build env values before passing them to the EAS process. */
export function readEasBuildProfile(
  value: unknown,
  profileName: string,
  parents: string[] = [],
): EasBuildProfile | null {
  if (parents.includes(profileName) || parents.length >= 5) return null;
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const build = (value as Record<string, unknown>).build;
  if (typeof build !== "object" || build === null || Array.isArray(build))
    return null;
  const profile = (build as Record<string, unknown>)[profileName];
  if (typeof profile !== "object" || profile === null || Array.isArray(profile))
    return null;
  const {
    channel,
    environment,
    env,
    extends: parentName,
  } = profile as Record<string, unknown>;
  if (channel !== undefined && typeof channel !== "string") return null;
  if (environment !== undefined && typeof environment !== "string") return null;
  if (parentName !== undefined && typeof parentName !== "string") return null;
  const parent =
    typeof parentName === "string"
      ? readEasBuildProfile(value, parentName, [...parents, profileName])
      : null;
  if (parentName !== undefined && !parent) return null;
  const profileEnv: Record<string, string> = {};
  if (env !== undefined) {
    if (typeof env !== "object" || env === null || Array.isArray(env))
      return null;
    for (const [key, entry] of Object.entries(env)) {
      if (typeof entry !== "string") return null;
      profileEnv[key] = entry;
    }
  }
  return {
    channel: channel ?? parent?.channel,
    environment: environment ?? parent?.environment,
    env: { ...parent?.env, ...profileEnv },
  };
}

export function readEasUpdateTarget(value: unknown, targetName: string) {
  const profileName = targetName === "master" ? "production" : targetName;
  const profile = readEasBuildProfile(value, profileName);
  if (!profile?.channel || !profile.environment) return null;
  return {
    profile: profileName,
    channel: profile.channel,
    environment: profile.environment,
    env: profile.env,
  };
}
