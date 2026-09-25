import { describe, expect, it } from "@jest/globals";
import {
  buildCombinedInstallPage,
  buildItmsInstallUrl,
  buildManifestPlist,
  escapeHtml,
  escapeXml,
  getArg,
  isProfile,
  objectUrl,
  releaseKeys,
} from "../../scripts/internal-release/install-artifacts";

describe("internal release manifest", () => {
  it("escapes & in plist IPA URLs so iOS can parse the manifest", () => {
    const ipaUrl =
      "https://example.r2.cloudflarestorage.com/bucket/app.ipa?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=key";
    const plist = buildManifestPlist({
      ipaUrl,
      bundleId: "onl.solace.calendar.dev",
      bundleVersion: "1",
      title: "Solace Calendar Dev",
    });
    expect(plist).toContain(`<string>${escapeXml(ipaUrl)}</string>`);
    expect(plist.includes("&X-Amz-Credential=")).toBe(false);
  });

  it("encodes the plist URL in the itms-services link", () => {
    const plistUrl = "https://cdn.example/solace/releases/development.plist?sig=1&exp=2";
    expect(buildItmsInstallUrl(plistUrl)).toContain(encodeURIComponent(plistUrl));
  });
});

describe("release keys", () => {
  it("keeps every artifact under the Solace prefix so shared buckets are never pruned", () => {
    expect(releaseKeys("development")).toEqual({
      ipa: "solace/releases/calendar/development.ipa",
      apk: "solace/releases/calendar/development.apk",
      plist: "solace/releases/calendar/development.plist",
      page: "solace/releases/calendar/development.html",
      qr: "solace/releases/calendar/development-qr.png",
    });
    expect(releaseKeys("preview").apk).toBe("solace/releases/calendar/preview.apk");
  });

  it("only accepts internal profiles", () => {
    expect(isProfile("development")).toBe(true);
    expect(isProfile("preview")).toBe(true);
    expect(isProfile("production")).toBe(false);
    expect(isProfile(undefined)).toBe(false);
  });

  it("joins public base URLs without doubled slashes", () => {
    expect(objectUrl("https://cdn.example/", "/solace/releases/preview.apk")).toBe(
      "https://cdn.example/solace/releases/preview.apk",
    );
  });

  it("reads flag values and ignores missing or blank ones", () => {
    expect(getArg(["--profile", "preview"], "--profile")).toBe("preview");
    expect(getArg(["--profile"], "--profile")).toBeUndefined();
    expect(getArg(["--url", " "], "--url")).toBeUndefined();
  });
});

describe("combined install page", () => {
  it("offers both platforms when both artifacts exist", () => {
    const iosInstallUrl = buildItmsInstallUrl(
      "https://cdn.example/solace/releases/development.plist",
    );
    const androidApkUrl = "https://cdn.example/solace/releases/development.apk";
    const page = buildCombinedInstallPage({
      title: "Solace Calendar Dev",
      profile: "development",
      iosInstallUrl,
      androidApkUrl,
    });
    expect(page).toContain(`href="${escapeHtml(iosInstallUrl)}"`);
    expect(page).toContain(`href="${escapeHtml(androidApkUrl)}"`);
    expect(page).toContain("Install on iPhone");
    expect(page).toContain("Download for Android");
  });

  it("disables a platform that has no artifact yet", () => {
    const page = buildCombinedInstallPage({
      title: "Solace Preview",
      profile: "preview",
      iosInstallUrl: "itms-services://?action=download-manifest&url=x",
      androidApkUrl: null,
    });
    expect(page).toContain("Install on iPhone");
    expect(page).toContain("Android build unavailable");
    expect(page).not.toContain("Download for Android");
  });

  it("escapes the title", () => {
    const page = buildCombinedInstallPage({
      title: "<script>x</script>",
      profile: "preview",
      iosInstallUrl: null,
      androidApkUrl: "https://cdn.example/a.apk",
    });
    expect(page).not.toContain("<script>x</script>");
  });
});
