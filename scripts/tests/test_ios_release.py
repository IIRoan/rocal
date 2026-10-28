import copy
import datetime
import importlib.util
import json
from pathlib import Path
import plistlib
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("ios_release", ROOT / "scripts/ios-release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


def config():
    return {
        "appConfig": {
            "name": "Solace Calendar", "version": "1.0.1", "runtimeVersion": {"policy": "appVersion"},
            "ios": {"bundleIdentifier": "onl.example.calendar", "infoPlist": {"ITSAppUsesNonExemptEncryption": False}, "associatedDomains": ["webcredentials:example.test"]},
            "updates": {"url": "https://u.expo.dev/example-project"},
            "extra": {
                "runtimeEnvironment": {"appUrl": "https://example.test/path?private=secret", "sentryDsn": "private-marker"},
                "notificationExtension": {"appGroup": "group.onl.example.calendar", "keychainService": "onl.example.keys"},
                "eas": {"projectId": "example-project", "build": {"experimental": {"ios": {"appExtensions": [{"targetName": "NotificationService", "bundleIdentifier": "onl.example.calendar.NotificationService"}]}}}},
            },
        },
        "buildProfile": {"channel": "testing", "distribution": "store", "env": {"SECRET": "private-marker"}},
    }


def archive_entries(expected):
    app = "Payload/Calendar.app"
    extension = app + "/PlugIns/NotificationService.appex"
    base = {"CFBundleShortVersionString": expected["appVersion"], "CFBundleVersion": "27", "DTSDKName": "iphoneos26.6", "DTXcode": "2660"}
    privacy = {"NSPrivacyTracking": False, "NSPrivacyTrackingDomains": []}
    return {
        app + "/Info.plist": {**base, "CFBundleIdentifier": expected["bundleIdentifier"], "ITSAppUsesNonExemptEncryption": False},
        extension + "/Info.plist": {**base, "CFBundleIdentifier": expected["extensionIdentifier"], "SolaceAppGroup": expected["appGroup"], "SolaceKeychainService": expected["keychainService"]},
        app + "/Expo.plist": {"EXUpdatesURL": expected["updateUrl"], "EXUpdatesRuntimeVersion": expected["runtimeVersion"], "EXUpdatesRequestHeaders": {"expo-channel-name": expected["channel"]}, "EXUpdatesEnabled": True},
        app + "/PrivacyInfo.xcprivacy": copy.deepcopy(privacy),
        extension + "/PrivacyInfo.xcprivacy": copy.deepcopy(privacy),
        app + "/Frameworks/Example.framework/PrivacyInfo.xcprivacy": {"NSPrivacyAccessedAPITypes": [{"NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults", "NSPrivacyAccessedAPITypeReasons": ["CA92.1"]}]},
    }


def entitlements(identifier, expected):
    return {"application-identifier": "TEAM123." + identifier, "com.apple.developer.team-identifier": "TEAM123", "com.apple.security.application-groups": [expected["appGroup"]], "get-task-allow": False}


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "release.ipa"
        self.expected, self.draft = release.prepare(config(), "calendar")
        self.entries = archive_entries(self.expected)

    def write_archive(self, extra=None):
        with zipfile.ZipFile(self.path, "w") as archive:
            for name, value in self.entries.items():
                archive.writestr(name, plistlib.dumps(value))
            if extra:
                archive.writestr(*extra)

    def test_metadata_only_contains_public_listing_fields(self):
        serialized = json.dumps([self.expected, self.draft])
        self.assertNotIn("private-marker", serialized)
        self.assertNotIn("private=secret", serialized)
        listing = self.draft["apple"]["info"]["en-US"]
        self.assertEqual(listing["supportUrl"], "https://example.test/support")
        self.assertEqual(listing["privacyPolicyUrl"], "https://example.test/privacy")
        self.assertEqual(self.expected["runtimeVersion"], "1.0.1")
        self.assertNotIn("advisory", self.draft["apple"])

    def test_rejects_nonpublic_websites_or_malformed_extension_config(self):
        for url in ["http://example.test", "https://user:password@example.test", "javascript:alert(1)"]:
            value = config()
            value["appConfig"]["extra"]["runtimeEnvironment"]["appUrl"] = url
            with self.subTest(url=url), self.assertRaises(release.ReleaseError):
                release.prepare(value, "calendar")
        value = config()
        value["appConfig"]["extra"]["eas"]["build"] = []
        with self.assertRaises(release.ReleaseError):
            release.prepare(value, "calendar")

    def test_valid_archive_reports_identity_runtime_and_sdk_reasons(self):
        self.write_archive()
        facts = release.verify(self.path, self.expected)
        self.assertEqual(facts["buildNumber"], "27")
        self.assertEqual(facts["privacyManifestCount"], 3)
        self.assertEqual(facts["requiredReasonApiFamilies"], ["NSPrivacyAccessedAPICategoryUserDefaults"])
        self.assertIs(facts["signatureVerified"], False)

    def test_rejects_mismatched_release_settings(self):
        mutations = [
            ("/Info.plist", "CFBundleIdentifier", "onl.other.app"),
            ("/Info.plist", "CFBundleShortVersionString", "0.9.0"),
            ("/Info.plist", "DTSDKName", "iphoneos18.0"),
            ("/Info.plist", "DTXcode", "1640"),
            ("/PlugIns/NotificationService.appex/Info.plist", "DTSDKName", "iphonesimulator26.6"),
            ("/PlugIns/NotificationService.appex/Info.plist", "CFBundleVersion", "26"),
            ("/PlugIns/NotificationService.appex/Info.plist", "SolaceAppGroup", "group.other"),
            ("/Expo.plist", "EXUpdatesURL", "https://u.expo.dev/legacy"),
            ("/Expo.plist", "EXUpdatesRuntimeVersion", "0.9.0"),
            ("/Expo.plist", "EXUpdatesRequestHeaders", {"expo-channel-name": "master"}),
            ("/Expo.plist", "EXUpdatesEnabled", False),
        ]
        for suffix, key, value in mutations:
            with self.subTest(key=key):
                self.entries = archive_entries(self.expected)
                self.entries["Payload/Calendar.app" + suffix][key] = value
                self.write_archive()
                with self.assertRaises(release.ReleaseError):
                    release.verify(self.path, self.expected)

    def test_rejects_missing_tracking_or_malformed_manifests(self):
        main = "Payload/Calendar.app/PrivacyInfo.xcprivacy"
        extension = "Payload/Calendar.app/PlugIns/NotificationService.appex/PrivacyInfo.xcprivacy"
        for name, manifest in [(main, {}), (main, {"NSPrivacyTracking": True}), (main, {"NSPrivacyTracking": False, "NSPrivacyTrackingDomains": ["tracker.test"]}), (extension, None), (main, {"NSPrivacyTracking": False, "NSPrivacyAccessedAPITypes": [{"NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults", "NSPrivacyAccessedAPITypeReasons": []}]})]:
            with self.subTest(name=name, manifest=manifest):
                self.entries = archive_entries(self.expected)
                if manifest is None:
                    del self.entries[name]
                else:
                    self.entries[name] = manifest
                self.write_archive()
                with self.assertRaises(release.ReleaseError):
                    release.verify(self.path, self.expected)

    def test_rejects_zip_traversal_duplicates_symlinks_and_oversized_plists(self):
        symlink = zipfile.ZipInfo("Payload/link")
        symlink.external_attr = (stat.S_IFLNK | 0o777) << 16
        for entry in [("../escape", b"bad"), ("/absolute", b"bad"), ("Payload\\escape", b"bad"), ("Payload/Calendar.app/./Expo.plist", b"bad"), ("Payload//Calendar.app/Expo.plist", b"bad"), (symlink, b"../../escape")]:
            with self.subTest(entry=entry):
                self.write_archive(entry)
                with self.assertRaises(release.ReleaseError):
                    release.verify(self.path, self.expected)
        self.write_archive()
        with patch.object(release, "MAX_PLIST_BYTES", 1), self.assertRaises(release.ReleaseError):
            release.verify(self.path, self.expected)
        with patch.object(release, "MAX_ARCHIVE_BYTES", 1), self.assertRaises(release.ReleaseError):
            release.verify(self.path, self.expected)
        with zipfile.ZipFile(self.path, "a") as archive:
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                archive.writestr("Payload/Calendar.app/Info.plist", b"duplicate")
        with self.assertRaisesRegex(release.ReleaseError, "duplicate"):
            release.verify(self.path, self.expected)

    def test_signature_requirement_cannot_silently_fall_back_on_linux(self):
        self.write_archive()
        with patch.object(release.sys, "platform", "linux"), self.assertRaisesRegex(release.ReleaseError, "macOS"):
            release.verify(self.path, self.expected, require_signature=True)

    def test_signing_checks_reject_wrong_profiles_debugging_and_expiry(self):
        main = entitlements(self.expected["bundleIdentifier"], self.expected)
        main["aps-environment"] = "production"
        main["com.apple.developer.associated-domains"] = self.expected["associatedDomains"]
        extension = entitlements(self.expected["extensionIdentifier"], self.expected)
        profiles = [{"ExpirationDate": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=30), "Entitlements": copy.deepcopy(value)} for value in [main, extension]]
        release.check_signing(main, extension, *profiles, self.expected)
        for key, value in [("ProvisionedDevices", []), ("ProvisionsAllDevices", True), ("ExpirationDate", datetime.datetime(2020, 1, 1))]:
            changed = copy.deepcopy(profiles)
            changed[0][key] = value
            with self.subTest(key=key), self.assertRaises(release.ReleaseError):
                release.check_signing(main, extension, *changed, self.expected)
        for key, value in [("application-identifier", "TEAM123.wrong"), ("get-task-allow", True), ("com.apple.security.application-groups", [])]:
            changed = copy.deepcopy(profiles)
            changed[1]["Entitlements"][key] = value
            with self.subTest(key=key), self.assertRaises(release.ReleaseError):
                release.check_signing(main, extension, *changed, self.expected)
        main["aps-environment"] = "development"
        with self.assertRaises(release.ReleaseError):
            release.check_signing(main, extension, *profiles, self.expected)

    def test_build_reference_rejects_ambiguous_unfinished_or_unrelated_results(self):
        build = {"id": "01234567-1234-1234-1234-0123456789ab", "platform": "IOS", "status": "FINISHED", "gitCommitHash": "a" * 40, "artifacts": {"buildUrl": "https://example.test/private-signed-url"}}
        _, reference = release.build_result([build])
        self.assertEqual(set(reference), {"id", "platform", "gitCommitHash"})
        for value in [[], [build, build], {**build, "status": "ERRORED"}, {**build, "platform": "ANDROID"}, {**build, "gitCommitHash": {"secret": "private"}}, {**build, "id": "invalid"}]:
            with self.subTest(value=value), self.assertRaises(release.ReleaseError):
                release.build_result(value)

    def test_cli_rejects_another_build_before_downloading(self):
        directory = Path(self.directory.name)
        expectations = directory / "expectations.json"
        build_json = directory / "build.json"
        report = directory / "report.json"
        expectations.write_text(json.dumps(self.expected))
        build_json.write_text(json.dumps({"id": "01234567-1234-1234-1234-0123456789ab", "platform": "IOS", "status": "FINISHED", "gitCommitHash": "a" * 40, "artifacts": {"buildUrl": "https://example.test/private-download-secret"}}))
        result = subprocess.run(["python3", str(ROOT / "scripts/ios-release.py"), "verify", "--expectations", str(expectations), "--build-json", str(build_json), "--build-id", "another-build", "--commit", "b" * 40, "--report", str(report)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn("source commit", result.stderr)
        self.assertNotIn("private-download-secret", result.stderr)
        self.assertFalse(report.exists())

    def test_plugin_writes_and_bundles_manifest_once_and_updates_extension_versions(self):
        result = subprocess.run(["node", str(ROOT / "scripts/tests/notification-extension.cjs")], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
