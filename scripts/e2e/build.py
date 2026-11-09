import os
from pathlib import Path
import shutil
import sys
import tarfile

from common import APPS, REPO, directory, output, run


def build(platform, app_names):
    binaries = directory() / "binaries"
    binaries.mkdir(exist_ok=True)
    for app in app_names:
        project = REPO / f"apps/native-{app}"
        run(["bunx", "expo", "prebuild", "--platform", platform, "--clean", "--no-install"], cwd=project)
        if platform == "ios":
            run(["pod", "install"], cwd=project / "ios")
            workspaces = list((project / "ios").glob("*.xcworkspace"))
            if len(workspaces) != 1:
                raise RuntimeError("Expected one generated iOS workspace")
            workspace = workspaces[0]
            derived = directory() / f"private/build-{app}"
            run(["xcodebuild", "-workspace", workspace, "-scheme", workspace.stem,
                 "-configuration", "Release", "-sdk", "iphonesimulator",
                 "-destination", "generic/platform=iOS Simulator", "-derivedDataPath", derived,
                 "CODE_SIGN_IDENTITY=-", "CODE_SIGN_STYLE=Manual", "DEVELOPMENT_TEAM=",
                 "PROVISIONING_PROFILE_SPECIFIER=", "ONLY_ACTIVE_ARCH=YES", "-quiet"], cwd=project)
            apps = list((derived / "Build/Products/Release-iphonesimulator").glob("*.app"))
            if len(apps) != 1:
                raise RuntimeError("Expected one release simulator app")
            shutil.copytree(apps[0], binaries / f"{app}.app", symlinks=True)
        else:
            environment = {**os.environ, "GRADLE_OPTS": '-Dorg.gradle.jvmargs="-Xmx4g -XX:MaxMetaspaceSize=1g" -Dorg.gradle.daemon=false'}
            run([project / "android/gradlew", "assembleRelease", "-PreactNativeArchitectures=x86_64", "--max-workers=2"], cwd=project / "android", env=environment)
            apks = list((project / "android/app/build/outputs/apk/release").glob("*.apk"))
            if len(apks) != 1:
                raise RuntimeError("Expected one release APK")
            shutil.copy2(apks[0], binaries / f"{app}.apk")
        print(f"Built {app}: release {platform} binary against the isolated loopback API", flush=True)


def restore_binaries(platform):
    root = directory()
    binaries = root / "binaries"
    binaries.mkdir(exist_ok=True)
    archives = sorted((root / "private/binary-archives").glob("*.tar.gz"))
    if not archives:
        raise RuntimeError("No native build archives were downloaded")
    for archive in archives:
        with tarfile.open(archive) as package:
            package.extractall(binaries, filter="data")
    extension = "app" if platform == "ios" else "apk"
    if any(not (binaries / f"{app}.{extension}").exists() for app in APPS):
        raise RuntimeError("The native build did not produce both Calendar and Mail")


if __name__ == "__main__":
    target = sys.argv[1]
    if target == "restore":
        if len(sys.argv) != 3 or sys.argv[2] not in ("ios", "android"):
            raise RuntimeError("Choose the ios or android archives to restore")
        restore_binaries(sys.argv[2])
    else:
        if target not in ("ios", "android"):
            raise RuntimeError("Choose ios, android or restore")
        apps = [sys.argv[2]] if len(sys.argv) > 2 else APPS
        if any(app not in APPS for app in apps):
            raise RuntimeError("Choose calendar or mail")
        build(target, apps)
