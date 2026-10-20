#!/usr/bin/env bash
# Export deployment-sized copies of the canonical logo; requires ImageMagick 7.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v magick >/dev/null || { echo 'Install ImageMagick 7 to export brand assets.' >&2; exit 1; }
source_logo=branding/assets/grozo-logo.png
test -s "$source_logo"

# A white square and generous margins preserve the wordmark under launcher masks.
magick "$source_logo" -resize 820x500 -gravity center -background white -extent 1024x1024 branding/assets/grozo-icon.png
mkdir -p packages/kraveo_ui/assets/brand
cp "$source_logo" packages/kraveo_ui/assets/brand/grozo-logo.png
for site in web/landing/public web/super_admin/public; do
  mkdir -p "$site/brand"
  magick "$source_logo" -resize 720x360 "$site/brand/grozo-logo.png"
  magick branding/assets/grozo-icon.png -resize 512x512 "$site/brand/grozo-icon.png"
  magick branding/assets/grozo-icon.png -resize 64x64 "$site/favicon.png"
done
for role in customer vendor driver; do
  res="apps/${role}_app/android/app/src/main/res"
  mkdir -p "$res/drawable-nodpi" "$res/mipmap-anydpi-v26"
  magick "$source_logo" -resize 720x432 -gravity center -background none -extent 720x432 "$res/drawable-nodpi/brand_logo.png"
  magick "$source_logo" -resize 280x168 -gravity center -background none -extent 432x432 "$res/drawable-nodpi/brand_splash_icon.png"
  # Adaptive foreground: the complete wordmark stays inside Android's safe circle.
  magick "$source_logo" -resize 270x162 -gravity center -background none -extent 432x432 "$res/drawable-nodpi/brand_launcher_foreground.png"
  for item in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
    density="${item%:*}"; size="${item#*:}"
    mkdir -p "$res/mipmap-$density"
    magick branding/assets/grozo-icon.png -resize "${size}x${size}" "$res/mipmap-$density/ic_launcher.png"
  done
  cat > "$res/mipmap-anydpi-v26/ic_launcher.xml" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@android:color/white"/>
    <foreground android:drawable="@drawable/brand_launcher_foreground"/>
</adaptive-icon>
XML
done
example=packages/kraveo_ui/example/web
magick branding/assets/grozo-icon.png -resize 64x64 "$example/favicon.png"
for size in 192 512; do
  for prefix in Icon Icon-maskable; do
    magick branding/assets/grozo-icon.png -resize "${size}x${size}" "$example/icons/$prefix-$size.png"
  done
done
echo 'Grozo mobile, Android and web brand assets exported.'
