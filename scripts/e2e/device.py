import json
import os
from pathlib import Path
import subprocess
import socket
import sys
import time

from common import APPS, REPO, directory, output, run, spawn, unpack


def ios():
    available = json.loads(output(["xcrun", "simctl", "list", "-j"]))
    runtimes = [runtime for runtime in available["runtimes"] if runtime.get("isAvailable") and ".SimRuntime.iOS-" in runtime["identifier"]]
    runtime = max(runtimes, key=lambda item: tuple(int(part) for part in item["version"].split(".")))
    models = [model for model in available["devicetypes"] if "iPhone" in model["name"]]
    model = next((model for model in models if model["name"] == "iPhone 17 Pro Max"), models[-1])
    identifier = output(["xcrun", "simctl", "create", "Solace E2E", model["identifier"], runtime["identifier"]])
    (directory() / "private/device.json").write_text(json.dumps({"id": identifier, "platform": "ios"}))
    run(["xcrun", "simctl", "boot", identifier])
    run(["xcrun", "simctl", "bootstatus", identifier, "-b"])
    run(["xcrun", "simctl", "ui", identifier, "appearance", "light"])
    for app in APPS:
        run(["xcrun", "simctl", "install", identifier, directory() / f"binaries/{app}.app"])
    run(["xcrun", "simctl", "addmedia", identifier, REPO / "crates/solace-api-tests/fixtures/avatar-512.png"])


def android():
    for port in [5580, 5581]:
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", port))
    sdk = Path(os.environ.get("ANDROID_HOME", os.environ.get("ANDROID_SDK_ROOT", "")))
    sdkmanager = sdk / "cmdline-tools/latest/bin/sdkmanager"
    avdmanager = sdkmanager.with_name("avdmanager")
    image = "system-images;android-36;google_apis;x86_64"
    run([sdkmanager, image, "platform-tools", "emulator"], stdout=subprocess.DEVNULL)
    avd_home = directory() / "private/android/avd"
    avd_home.mkdir(parents=True, exist_ok=True)
    environment = {**os.environ, "ANDROID_AVD_HOME": str(avd_home), "ANDROID_USER_HOME": str(avd_home.parent)}
    run([avdmanager, "create", "avd", "--force", "--name", "solace-e2e", "--package", image, "--device", "pixel_6"], input="no\n", text=True, env=environment)
    emulator = sdk / "emulator/emulator"
    process = spawn("emulator", [emulator, "-avd", "solace-e2e", "-port", "5580", "-no-window", "-no-audio", "-no-boot-anim", "-no-snapshot", "-gpu", "swiftshader_indirect", "-memory", "2048", "-cores", "2", "-camera-back", "none", "-camera-front", "none"], environment)
    identifier = "emulator-5580"
    adb = [sdk / "platform-tools/adb", "-s", identifier]
    deadline = time.monotonic() + 240
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("The isolated Android emulator exited")
        result = subprocess.run([*adb, "shell", "getprop", "sys.boot_completed"], text=True, capture_output=True, check=False)
        if result.stdout.strip() == "1":
            break
        time.sleep(2)
    else:
        raise RuntimeError("Android emulator did not boot")
    (directory() / "private/device.json").write_text(json.dumps({"id": identifier, "platform": "android"}))
    for scale in ["window_animation_scale", "transition_animation_scale", "animator_duration_scale"]:
        run([*adb, "shell", "settings", "put", "global", scale, "1"])
    run([*adb, "reverse", "tcp:4001", "tcp:4001"])
    run([*adb, "reverse", "tcp:59000", "tcp:59000"])
    for app in APPS:
        run([*adb, "install", "-r", directory() / f"binaries/{app}.apk"])
    run([*adb, "push", REPO / "crates/solace-api-tests/fixtures/avatar-512.png", "/sdcard/Download/solace-fixture.png"])
    run([*adb, "shell", "am", "broadcast", "-a", "android.intent.action.MEDIA_SCANNER_SCAN_FILE", "-d", "file:///sdcard/Download/solace-fixture.png"])


if __name__ == "__main__":
    platform = sys.argv[1]
    tool = unpack("maestro", "maestro")
    (directory() / "private/maestro-path").write_text(str(tool))
    (ios if platform == "ios" else android)()
