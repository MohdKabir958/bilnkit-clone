#!/usr/bin/env bash
set -euo pipefail
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
role="${1:?Usage: bash scripts/check_flutter.sh customer|vendor|driver}"
case "$role" in customer|vendor|driver) ;; *) exit 2 ;; esac
export PUB_CACHE="${PUB_CACHE:-$root_dir/build/tool-state/pub}"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$root_dir/build/tool-state/config}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$root_dir/build/tool-state/cache}"
export ANALYZER_STATE_LOCATION_OVERRIDE="${ANALYZER_STATE_LOCATION_OVERRIDE:-$root_dir/build/tool-state/analyzer}"
cd "$root_dir/apps/${role}_app"
flutter pub get --enforce-lockfile
flutter analyze --no-pub
flutter test --no-pub --concurrency=2
flutter build bundle --debug --target-platform=linux-x64 --no-pub
