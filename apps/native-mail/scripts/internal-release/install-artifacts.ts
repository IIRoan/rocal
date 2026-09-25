export const PROFILES = ["development", "preview"] as const;
export type Profile = (typeof PROFILES)[number];

/** App-scoped so the calendar and mail apps (or anything else in a shared bucket) never prune each other's artifacts. */
export const RELEASE_PREFIX = "solace/releases/mail/";

export const releaseKeys = (profile: Profile) => ({
  ipa: `${RELEASE_PREFIX}${profile}.ipa`,
  apk: `${RELEASE_PREFIX}${profile}.apk`,
  plist: `${RELEASE_PREFIX}${profile}.plist`,
  page: `${RELEASE_PREFIX}${profile}.html`,
  qr: `${RELEASE_PREFIX}${profile}-qr.png`,
});

export function isProfile(value: string | undefined): value is Profile {
  return value !== undefined && (PROFILES as readonly string[]).includes(value);
}

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildManifestPlist(input: {
  ipaUrl: string;
  bundleId: string;
  bundleVersion: string;
  title: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>items</key>
    <array>
      <dict>
        <key>assets</key>
        <array>
          <dict>
            <key>kind</key><string>software-package</string>
            <key>url</key><string>${escapeXml(input.ipaUrl)}</string>
          </dict>
        </array>
        <key>metadata</key>
        <dict>
          <key>bundle-identifier</key><string>${escapeXml(input.bundleId)}</string>
          <key>bundle-version</key><string>${escapeXml(input.bundleVersion)}</string>
          <key>kind</key><string>software</string>
          <key>title</key><string>${escapeXml(input.title)}</string>
        </dict>
      </dict>
    </array>
  </dict>
</plist>
`;
}

export function buildItmsInstallUrl(plistUrl: string): string {
  return `itms-services://?action=download-manifest&url=${encodeURIComponent(plistUrl)}`;
}

/** One QR page for both platforms; a missing artifact renders a disabled row instead of a dead link. */
export function buildCombinedInstallPage(input: {
  title: string;
  profile: string;
  iosInstallUrl: string | null;
  androidApkUrl: string | null;
}): string {
  const iosBlock = input.iosInstallUrl
    ? `<a class="btn" href="${escapeHtml(input.iosInstallUrl)}">Install on iPhone</a>
        <p class="hint">Open this page in Safari, then tap Install. Your device must be registered for ad-hoc builds.</p>`
    : `<span class="btn btn-disabled" aria-disabled="true">iOS build unavailable</span>`;

  const androidBlock = input.androidApkUrl
    ? `<a class="btn" href="${escapeHtml(input.androidApkUrl)}">Download for Android</a>
        <p class="hint">Tap to download the APK, then open it to install. Allow installs from this source if prompted.</p>`
    : `<span class="btn btn-disabled" aria-disabled="true">Android build unavailable</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex"/>
<title>${escapeHtml(input.title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #1f1f1f; color: #f5f5f4; font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; }
  main { width: 100%; max-width: 420px; }
  h1 { font-size: 1.5rem; margin: 0 0 4px; }
  .profile { color: #a3a3a3; margin: 0 0 24px; text-transform: capitalize; }
  .platform { border: 1px solid #2e2e2e; border-radius: 12px; padding: 20px; margin-bottom: 16px; background: #262626; }
  .platform h2 { font-size: 1rem; margin: 0 0 12px; }
  .btn { display: block; text-align: center; text-decoration: none; padding: 12px 16px; border-radius: 8px;
    background: #ffe0c2; color: #1f1f1f; font-weight: 600; }
  .btn-disabled { background: #2e2e2e; color: #6b6b6b; }
  .hint { color: #a3a3a3; font-size: 0.85rem; margin: 12px 0 0; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(input.title)}</h1>
  <p class="profile">${escapeHtml(input.profile)} build</p>
  <section class="platform">
    <h2>iOS</h2>
    ${iosBlock}
  </section>
  <section class="platform">
    <h2>Android</h2>
    ${androidBlock}
  </section>
</main>
</body>
</html>
`;
}

export function objectUrl(base: string, key: string): string {
  return `${base.replace(/\/+$/, "")}/${key.replace(/^\//, "")}`;
}

export function getArg(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1]?.trim();
  return value ? value : undefined;
}
