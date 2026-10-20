#!/usr/bin/env bash
# Personal-device testing only; Profile APKs use development signing, never store releases.
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
role="${1:?Usage: bash scripts/build_android_preview.sh customer|vendor|driver}"
case "$role" in customer|vendor|driver) ;; *) echo 'Unknown app role.' >&2; exit 2 ;; esac
: "${GROZO_BACKEND_ORIGIN:?Set the deployed HTTPS backend origin}"
export GROZO_BACKEND_ORIGIN
python3 - <<'PY'
import os,sys
from urllib.parse import urlsplit
u=urlsplit(os.environ['GROZO_BACKEND_ORIGIN'])
if u.scheme!='https' or not u.hostname or u.username or u.password or u.path not in ('','/') or u.query or u.fragment:
    sys.exit('GROZO_BACKEND_ORIGIN must be an HTTPS origin without credentials or paths.')
if u.hostname in ('localhost','127.0.0.1','10.0.2.2') or u.hostname.endswith(('.example','.invalid','.test')):
    sys.exit('Use the real deployed backend, not an emulator or example address.')
PY
api_origin="${GROZO_BACKEND_ORIGIN%/}"
readiness_file="$(mktemp "${TMPDIR:-/tmp}/grozo-ready.XXXXXX")"
trap 'rm -f "$readiness_file"' EXIT
curl --fail --silent --show-error --max-time 45 "$api_origin/ready" -o "$readiness_file"
python3 - "$readiness_file" <<'PY'
import json,sys
if json.load(open(sys.argv[1])).get('ready') is not True:
    sys.exit('Backend readiness did not pass. APKs were not built.')
PY
architecture="${ANDROID_PREVIEW_TARGET:-android-arm64}"
case "$architecture" in android-arm64) abi=arm64-v8a ;; android-arm) abi=armeabi-v7a ;; *) echo 'Choose android-arm64 or android-arm.' >&2; exit 2 ;; esac
export PUB_CACHE="${PUB_CACHE:-$repo_dir/build/tool-state/pub}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$repo_dir/build/tool-state/config}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$repo_dir/build/tool-state/cache}"
app_dir="$repo_dir/apps/${role}_app"
if [[ "${ANDROID_PREVIEW_DISABLE_FIREBASE:-false}" == true ]]; then
  export ORG_GRADLE_PROJECT_disableFirebase=true
  echo 'Preview: Firebase is explicitly disabled; push delivery will be unavailable.'
else
  [[ -s "$app_dir/android/app/google-services.json" ]] || { echo 'Supply matching owned Firebase client JSON, or explicitly set ANDROID_PREVIEW_DISABLE_FIREBASE=true.' >&2; exit 1; }
  unset ORG_GRADLE_PROJECT_disableFirebase
fi
python3 "$repo_dir/scripts/configure_brand.py" --check
(
  cd "$app_dir"
  flutter pub get --enforce-lockfile
  flutter build apk --profile --split-per-abi --target-platform "$architecture" --no-pub \
    --dart-define="API_BASE_URL=$api_origin/api" \
    --dart-define="SOCKET_URL=$api_origin" \
    --dart-define="GOOGLE_SERVER_CLIENT_ID=${GOOGLE_SERVER_CLIENT_ID:-}"
)
output_dir="$repo_dir/build/device-preview/$role"
mkdir -p "$output_dir"
cp "$app_dir/build/app/outputs/flutter-apk/app-$abi-profile.apk" "$output_dir/Grozo-$role-$abi-preview.apk"
(
  cd "$output_dir"
  sha256sum ./*.apk > SHA256SUMS.txt
  cat > INSTALL.txt <<EOF
Grozo $role - personal-device preview ($abi)
Backend: $api_origin
Install the APK after extracting the GitHub Actions artifact ZIP.
This is a development-signed profile APK, not a Play Store release.
Firebase disabled: ${ANDROID_PREVIEW_DISABLE_FIREBASE:-false}
Customer Google sign-in needs owned OAuth clients and signing fingerprints.
If Android reports a signing conflict, uninstall the previous preview first;
uninstalling removes its local app data. Never uninstall an app containing data
you need without preserving it first.
EOF
)
echo "Device preview prepared in build/device-preview/$role (APKs and SHA256SUMS.txt)."
