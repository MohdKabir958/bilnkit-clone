#!/usr/bin/env python3
"""Compile the official SDK in an EXISTING Flutter app without changing app sources.

This is a compilation experiment, not a login test or a distributable APK build.
No credentials are accepted. The SDK is not registered in a running Activity.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
SDK_VERSION = "1.2.1"


def init_script(source_dir: Path) -> str:
    # Groovy double-quoted strings interpolate '$'. Use an escaped single-quoted literal.
    literal = "'" + str(source_dir).replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "\\r") + "'"
    return """gradle.beforeProject { p ->
  if (p.name == 'app') {
    p.afterEvaluate {
      p.dependencies.add('implementation', 'com.clerk:clerk-android-api:%s')
      p.dependencies.add('implementation', 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0')
      p.android.defaultConfig.minSdk = 24
      p.android.sourceSets.main.java.srcDir(%s)
    }
  }
}
""" % (SDK_VERSION, literal)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", required=True, choices=["customer", "vendor", "driver"])
    parser.add_argument("--output", type=Path, default=ROOT / "backend/var/clerk-feasibility")
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    android = ROOT / f"apps/{args.app}_app/android"
    command = [str(android / "gradlew"), ":app:compileDebugKotlin", "-PdisableFirebase=true",
               "--console=plain", "--init-script", "<temporary-init-script>"]
    start = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="grozo-clerk-probe-") as tmp:
        init = Path(tmp) / "probe.gradle"
        init.write_text(init_script(ROOT / "scripts/clerk/native"))
        actual_command = [*command[:-1], str(init)]
        with (output / f"{args.app}-native-compile.log").open("w") as log:
            result = subprocess.run(actual_command, cwd=android, stdout=log, stderr=subprocess.STDOUT)
    report = {
        "app": args.app, "sdk": f"com.clerk:clerk-android-api:{SDK_VERSION}",
        "command": command, "workingDirectory": str(android.relative_to(ROOT)),
        "exitCode": result.returncode, "durationSeconds": round(time.monotonic() - start, 3),
        "firebase": "Disabled explicitly for this local debug compilation only; source integration retained.",
        "minimumAndroidApi": "24 for this temporary probe only; existing app configuration unchanged.",
        "productionSourceModified": False, "apkBuilt": False, "providerLoginVerified": False,
        "realDeviceVerified": False,
        "environmentVariableNames": sorted(k for k in os.environ if k in {
            "JAVA_HOME", "ANDROID_HOME", "ANDROID_SDK_ROOT", "ANDROID_USER_HOME", "GRADLE_USER_HOME",
            "PUB_CACHE", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "ANALYZER_STATE_LOCATION_OVERRIDE",
            "DASH__SUPPRESS_ANALYTICS"}),
    }
    (output / f"{args.app}-native-compile.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
