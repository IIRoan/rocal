#!/usr/bin/env python3
import argparse
import datetime
import json
from pathlib import Path, PurePosixPath
import plistlib
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit
from urllib.request import HTTPSHandler, HTTPRedirectHandler, Request, build_opener
import zipfile

ROOT = Path(__file__).resolve().parent.parent
MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024
MAX_PLIST_BYTES = 1024 * 1024


class ReleaseError(Exception):
    pass


def record(value, label):
    if not isinstance(value, dict):
        raise ReleaseError(f"Missing or invalid {label}")
    return value


def text(value, label):
    if not isinstance(value, str) or not value.strip():
        raise ReleaseError(f"Missing or invalid {label}")
    return value.strip()


def https_url(value, label):
    value = text(value, label)
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ReleaseError(f"{label} must be an HTTPS URL without credentials")
    return value


def prepare(config, app, product=None, listings=None):
    product = product if product is not None else json.loads((ROOT / "packages/calendar-core/src/product-info.json").read_text())
    listings = listings if listings is not None else json.loads((ROOT / "packages/native-core/store-listings.json").read_text())
    requirements = json.loads((ROOT / "packages/native-core/expo-apps.json").read_text())["iosStoreRequirements"]
    listing = record(listings.get(app), "app listing")
    config = record(config, "EAS configuration")
    cfg = record(config.get("appConfig"), "Expo app config")
    build = record(config.get("buildProfile"), "build profile")
    ios = record(cfg.get("ios"), "iOS configuration")
    extra = record(cfg.get("extra"), "Expo extras")
    eas = record(extra.get("eas"), "EAS project")
    extension = record(extra.get("notificationExtension"), "notification extension")
    extension_build = record(eas.get("build"), "extension build configuration")
    experimental = record(extension_build.get("experimental"), "extension configuration")
    extensions = record(experimental.get("ios"), "iOS extensions").get("appExtensions")
    if not isinstance(extensions, list) or len(extensions) != 1:
        raise ReleaseError("Expected exactly one configured notification extension")
    target = record(extensions[0], "extension target")
    version = text(cfg.get("version"), "app version")
    runtime = cfg.get("runtimeVersion")
    if runtime == {"policy": "appVersion"}:
        runtime = version
    runtime = text(runtime, "runtime version")
    uses_encryption = record(ios.get("infoPlist"), "Info.plist settings").get("ITSAppUsesNonExemptEncryption")
    if not isinstance(uses_encryption, bool):
        raise ReleaseError("Set an explicit encryption declaration before preparing a store build")
    website = https_url(record(extra.get("runtimeEnvironment"), "runtime environment").get("appUrl"), "public website")
    parsed = urlsplit(website)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    domains = ios.get("associatedDomains", [])
    if not isinstance(domains, list) or not all(isinstance(v, str) for v in domains):
        raise ReleaseError("Invalid associated domains")
    expected = {
        "schemaVersion": 1,
        "app": app,
        "bundleIdentifier": text(ios.get("bundleIdentifier"), "bundle identifier"),
        "extensionIdentifier": text(target.get("bundleIdentifier"), "extension identifier"),
        "extensionTarget": text(target.get("targetName"), "extension target name"),
        "appVersion": version,
        "runtimeVersion": runtime,
        "channel": text(build.get("channel"), "update channel"),
        "distribution": text(build.get("distribution"), "distribution"),
        "updateUrl": https_url(record(cfg.get("updates"), "update settings").get("url"), "update URL"),
        "appGroup": text(extension.get("appGroup"), "App Group"),
        "keychainService": text(extension.get("keychainService"), "extension keychain service"),
        "associatedDomains": domains,
        "usesNonExemptEncryption": uses_encryption,
        "projectId": text(eas.get("projectId"), "project ID"),
        "minimumXcodeMajor": requirements["minimumXcodeMajor"],
        "minimumSdkMajor": requirements["minimumSdkMajor"],
    }
    title = text(cfg.get("name"), "app name")
    subtitle = text(listing.get("subtitle"), "subtitle")
    keywords = listing.get("keywords")
    if len(title) > 30 or len(subtitle) > 30:
        raise ReleaseError("Store title and subtitle must fit Apple's 30-character limit")
    if not isinstance(keywords, list) or not all(isinstance(v, str) and v and "," not in v for v in keywords) or len(",".join(keywords)) > 100:
        raise ReleaseError("Store keywords must fit Apple's 100-character limit")
    draft = {"configVersion": 0, "apple": {"version": version, "info": {"en-US": {
        "title": title, "subtitle": subtitle, "description": text(listing.get("description"), "description"),
        "keywords": keywords, "marketingUrl": origin, "supportUrl": origin + product["supportPath"],
        "privacyPolicyUrl": origin + product["privacyPath"],
    }}}}
    return expected, draft


def build_result(value):
    builds = value if isinstance(value, list) else [value]
    if len(builds) != 1:
        raise ReleaseError("Expected exactly one iOS build result")
    build = record(builds[0], "build result")
    if str(build.get("platform", "")).upper() != "IOS" or build.get("status") != "FINISHED":
        raise ReleaseError("The selected iOS build has not finished successfully")
    identifier = text(build.get("id"), "build ID")
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", identifier):
        raise ReleaseError("Invalid EAS build ID")
    commit = text(build.get("gitCommitHash"), "build source commit")
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ReleaseError("Invalid build source commit")
    return build, {"id": identifier, "platform": "IOS", "gitCommitHash": commit}


class HttpsRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        https_url(newurl, "artifact redirect")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download(build, destination):
    url = https_url(record(build.get("artifacts"), "build artifacts").get("buildUrl"), "artifact URL")
    opener = build_opener(HTTPSHandler(), HttpsRedirects())
    total = 0
    with opener.open(Request(url), timeout=60) as response, destination.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_ARCHIVE_BYTES:
                raise ReleaseError("iOS archive exceeds the download limit")
            output.write(chunk)


def read_plist(archive, name):
    try:
        if archive.getinfo(name).file_size > MAX_PLIST_BYTES:
            raise ReleaseError("Archive plist exceeds the size limit")
        return record(plistlib.loads(archive.read(name)), "archive plist")
    except (KeyError, ValueError, plistlib.InvalidFileException):
        raise ReleaseError("A required archive plist is missing or invalid") from None


def check_privacy(archive, name, require_tracking_declaration=False):
    manifest = read_plist(archive, name)
    tracking = manifest.get("NSPrivacyTracking", False)
    domains = manifest.get("NSPrivacyTrackingDomains", [])
    if tracking is not False or not isinstance(domains, list) or domains:
        raise ReleaseError("Archive contains a missing no-tracking declaration or tracking domains")
    if require_tracking_declaration and "NSPrivacyTracking" not in manifest:
        raise ReleaseError("App privacy manifest must explicitly declare no tracking")
    accessed = manifest.get("NSPrivacyAccessedAPITypes", [])
    if not isinstance(accessed, list):
        raise ReleaseError("Invalid required-reason API declarations")
    families = []
    for entry in accessed:
        entry = record(entry, "required-reason API entry")
        family = text(entry.get("NSPrivacyAccessedAPIType"), "required-reason API family")
        reasons = entry.get("NSPrivacyAccessedAPITypeReasons")
        if not family.startswith("NSPrivacyAccessedAPICategory") or not isinstance(reasons, list) or not reasons or not all(isinstance(v, str) and re.fullmatch(r"[A-F0-9]{4}\.[0-9]+", v) for v in reasons):
            raise ReleaseError("A required-reason API family has missing or malformed reasons")
        families.append(family)
    return families


def archive_facts(path, expected):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) > 100000:
            raise ReleaseError("Archive contains too many entries")
        if len(names) != len(set(names)):
            raise ReleaseError("Archive contains duplicate paths")
        total = 0
        for info in archive.infolist():
            name = PurePosixPath(info.filename)
            canonical = str(name) + ("/" if info.is_dir() else "")
            if info.filename != canonical or name.is_absolute() or ".." in name.parts or "\\" in info.filename or stat.S_ISLNK(info.external_attr >> 16):
                raise ReleaseError("Archive contains unsafe paths or symbolic links")
            total += info.file_size
            if total > MAX_ARCHIVE_BYTES:
                raise ReleaseError("Uncompressed archive exceeds the size limit")
        roots = [name.removesuffix("/Info.plist") for name in names if re.fullmatch(r"Payload/[^/]+\.app/Info\.plist", name)]
        if len(roots) != 1:
            raise ReleaseError("Expected one main application in the IPA")
        root = roots[0]
        extension = root + "/PlugIns/" + expected["extensionTarget"] + ".appex"
        main = read_plist(archive, root + "/Info.plist")
        service = read_plist(archive, extension + "/Info.plist")
        updates = read_plist(archive, root + "/Expo.plist")
        if not isinstance(main.get("ITSAppUsesNonExemptEncryption"), bool):
            raise ReleaseError("Archive encryption declaration must be a boolean")
        for info in [main, service]:
            sdk = re.fullmatch(r"iphoneos([0-9]+)(?:\.[0-9]+){1,2}", str(info.get("DTSDKName", "")))
            xcode = str(info.get("DTXcode", ""))
            if not sdk or int(sdk.group(1)) < expected["minimumSdkMajor"] or not re.fullmatch(r"[0-9]{3,4}", xcode) or int(xcode) // 100 < expected["minimumXcodeMajor"]:
                raise ReleaseError("Archive does not meet the configured Apple SDK/Xcode minimums")
        comparisons = [
            (main.get("CFBundleIdentifier"), expected["bundleIdentifier"], "main bundle identifier"),
            (service.get("CFBundleIdentifier"), expected["extensionIdentifier"], "extension bundle identifier"),
            (main.get("CFBundleShortVersionString"), expected["appVersion"], "app version"),
            (service.get("CFBundleShortVersionString"), main.get("CFBundleShortVersionString"), "extension version"),
            (service.get("CFBundleVersion"), main.get("CFBundleVersion"), "extension build number"),
            (updates.get("EXUpdatesURL"), expected["updateUrl"], "EAS project update endpoint"),
            (updates.get("EXUpdatesRuntimeVersion"), expected["runtimeVersion"], "update runtime"),
            (record(updates.get("EXUpdatesRequestHeaders"), "update request headers").get("expo-channel-name"), expected["channel"], "update channel"),
            (main.get("ITSAppUsesNonExemptEncryption"), expected["usesNonExemptEncryption"], "encryption declaration"),
            (service.get("SolaceAppGroup"), expected["appGroup"], "extension App Group"),
            (service.get("SolaceKeychainService"), expected["keychainService"], "extension keychain service"),
        ]
        for actual, wanted, label in comparisons:
            if actual != wanted:
                raise ReleaseError(f"Archive does not match its configured {label}")
        if not re.fullmatch(r"[0-9]+(?:\.[0-9]+){0,2}", str(main.get("CFBundleVersion", ""))):
            raise ReleaseError("Invalid archive build number")
        if expected["distribution"] == "store" and updates.get("EXUpdatesEnabled") is not True:
            raise ReleaseError("Store archive does not enable its configured updates service")
        if "NSUserTrackingUsageDescription" in main:
            raise ReleaseError("Unexpected tracking-permission declaration")
        required = [root + "/PrivacyInfo.xcprivacy", extension + "/PrivacyInfo.xcprivacy"]
        if any(name not in names for name in required):
            raise ReleaseError("The main app and notification extension must both include privacy manifests")
        manifests = [name for name in names if name.startswith(root + "/") and name.endswith("/PrivacyInfo.xcprivacy")]
        families = sorted({family for name in manifests for family in check_privacy(archive, name, name in required)})
        return {"bundleIdentifier": expected["bundleIdentifier"], "extensionIdentifier": expected["extensionIdentifier"],
                "appVersion": expected["appVersion"], "buildNumber": main["CFBundleVersion"], "runtimeVersion": expected["runtimeVersion"],
                "channel": expected["channel"], "projectId": expected["projectId"], "privacyManifestCount": len(manifests),
                "sdk": main["DTSDKName"], "xcode": main["DTXcode"],
                "requiredReasonApiFamilies": families}, root, extension


def command_output(args, label):
    result = subprocess.run(args, capture_output=True)
    if result.returncode:
        raise ReleaseError(label + " failed")
    return result.stdout


def signed_entitlements(path):
    command_output(["codesign", "--verify", "--deep", "--strict", str(path)], "Code signature verification")
    return record(plistlib.loads(command_output(["codesign", "-d", "--entitlements", ":-", str(path)], "Entitlement inspection")), "signed entitlements")


def check_signing(main, service, main_profile, service_profile, expected):
    team = text(main.get("com.apple.developer.team-identifier"), "signed team identifier")
    if service.get("com.apple.developer.team-identifier") != team:
        raise ReleaseError("Main app and extension use different signing teams")
    for entitlements, profile, identifier in [(main, main_profile, expected["bundleIdentifier"]), (service, service_profile, expected["extensionIdentifier"])]:
        if entitlements.get("application-identifier") != team + "." + identifier or expected["appGroup"] not in entitlements.get("com.apple.security.application-groups", []):
            raise ReleaseError("Signed app identity or App Group does not match the configured app")
        authorized = record(profile.get("Entitlements"), "profile entitlements")
        if authorized.get("application-identifier") != entitlements.get("application-identifier") or authorized.get("com.apple.developer.team-identifier") != team or expected["appGroup"] not in authorized.get("com.apple.security.application-groups", []):
            raise ReleaseError("Provisioning profile does not authorize the signed app identity and App Group")
        expires = profile.get("ExpirationDate")
        if not isinstance(expires, datetime.datetime) or expires.replace(tzinfo=datetime.timezone.utc) <= datetime.datetime.now(datetime.timezone.utc):
            raise ReleaseError("Provisioning profile is expired or missing its expiry")
        if expected["distribution"] == "store" and ("ProvisionedDevices" in profile or profile.get("ProvisionsAllDevices") or entitlements.get("get-task-allow", False) is not False or authorized.get("get-task-allow", False) is not False):
            raise ReleaseError("Store release contains ad-hoc, enterprise or debugging provisioning")
        if expected["distribution"] == "store" and identifier == expected["bundleIdentifier"] and authorized.get("aps-environment") != "production":
            raise ReleaseError("Store profile does not authorize production push notifications")
    if expected["distribution"] == "store" and main.get("aps-environment") != "production":
        raise ReleaseError("Store release does not use production push entitlements")
    if not set(expected["associatedDomains"]).issubset(main.get("com.apple.developer.associated-domains", [])):
        raise ReleaseError("Signed associated domains do not match the configured app")


def verify(path, expected, require_signature=False):
    facts, root, extension = archive_facts(path, expected)
    facts["signatureVerified"] = False
    if require_signature:
        if sys.platform != "darwin" or not shutil.which("codesign") or not shutil.which("security"):
            raise ReleaseError("Signature verification requires macOS codesign and security")
        with tempfile.TemporaryDirectory(prefix="solace-ios-archive-") as directory:
            with zipfile.ZipFile(path) as archive:
                archive.extractall(directory)
                for entry in archive.infolist():
                    if not entry.is_dir():
                        (Path(directory) / entry.filename).chmod(0o700 if (entry.external_attr >> 16) & 0o111 else 0o600)
            main_path, service_path = Path(directory) / root, Path(directory) / extension
            profiles = [record(plistlib.loads(command_output(["security", "cms", "-D", "-i", str(app / "embedded.mobileprovision")], "Provisioning inspection")), "provisioning profile") for app in [main_path, service_path]]
            check_signing(signed_entitlements(main_path), signed_entitlements(service_path), *profiles, expected)
            facts["signatureVerified"] = True
    return facts


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description="Prepare public release metadata and verify the exact iOS archive before submission.")
    sub = parser.add_subparsers(dest="command", required=True)
    prep = sub.add_parser("prepare")
    prep.add_argument("--app", choices=["calendar", "mail"], required=True)
    prep.add_argument("--eas-config", type=Path, required=True)
    prep.add_argument("--out-dir", type=Path, required=True)
    reference = sub.add_parser("reference")
    reference.add_argument("--build-json", type=Path, required=True)
    reference.add_argument("--output", type=Path, required=True)
    validate = sub.add_parser("verify")
    validate.add_argument("--expectations", type=Path, required=True)
    source = validate.add_mutually_exclusive_group(required=True)
    source.add_argument("--ipa", type=Path)
    source.add_argument("--build-json", type=Path)
    validate.add_argument("--report", type=Path, required=True)
    validate.add_argument("--require-signature", action="store_true")
    validate.add_argument("--build-id")
    validate.add_argument("--commit")
    args = parser.parse_args()
    if args.command == "prepare":
        expected, draft = prepare(json.loads(args.eas_config.read_text()), args.app)
        write_json(args.out_dir / "archive-expectations.json", expected)
        write_json(args.out_dir / "store.config.draft.json", draft)
    elif args.command == "reference":
        _, ref = build_result(json.loads(args.build_json.read_text()))
        write_json(args.output, ref)
    else:
        expected = record(json.loads(args.expectations.read_text()), "archive expectations")
        with tempfile.TemporaryDirectory(prefix="solace-ios-download-") as directory:
            ipa = args.ipa
            if args.build_json:
                build, ref = build_result(json.loads(args.build_json.read_text()))
                if args.build_id != ref["id"] or args.commit != ref["gitCommitHash"]:
                    raise ReleaseError("Selected build does not match the workflow build ID and source commit")
                ipa = Path(directory) / "release.ipa"
                download(build, ipa)
            write_json(args.report, verify(ipa, expected, args.require_signature))
    print("iOS release " + args.command + ": OK")


if __name__ == "__main__":
    try:
        main()
    except (ReleaseError, OSError, ValueError, zipfile.BadZipFile) as error:
        message = str(error) if isinstance(error, ReleaseError) else "Unable to read or verify iOS release inputs"
        print("iOS release check failed: " + message, file=sys.stderr)
        sys.exit(1)
