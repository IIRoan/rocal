/** Reject invalid build env values before passing them to the EAS process. */
export function readEasBuildProfile(value: unknown, profileName: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const build = (value as Record<string, unknown>).build;
  if (typeof build !== "object" || build === null || Array.isArray(build)) return null;
  const profile = (build as Record<string, unknown>)[profileName];
  if (typeof profile !== "object" || profile === null || Array.isArray(profile)) return null;
  const { channel, environment, env } = profile as Record<string, unknown>;
  if (channel !== undefined && typeof channel !== "string") return null;
  if (environment !== undefined && typeof environment !== "string") return null;
  const profileEnv: Record<string, string> = {};
  if (env !== undefined) {
    if (typeof env !== "object" || env === null || Array.isArray(env)) return null;
    for (const [key, entry] of Object.entries(env)) {
      if (typeof entry !== "string") return null;
      profileEnv[key] = entry;
    }
  }
  return { channel, environment, env: profileEnv };
}

