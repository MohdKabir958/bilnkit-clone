# Grozo branding

`brand.json` defines the public name, role labels, Android application IDs and primary/accent colors. Internal package names, storage keys, database fields and original copyright notices retain their compatible identifiers.

`assets/grozo-logo.png` is the canonical transparent wordmark, prepared from the Grozo reference supplied by the user. It preserves the green lettering, leaves and underline. The small tagline and surrounding app tile are omitted from the wordmark for legibility at mobile sizes. `assets/grozo-icon.png` is its square launcher export.

After changing configuration, run `python3 scripts/configure_brand.py`, then `python3 scripts/configure_brand.py --check`. After changing the canonical artwork, run `bash scripts/export_brand_assets.sh` (ImageMagick 7 required). Commit the exported assets so normal builds do not need ImageMagick.

The exports cover shared Flutter branding, all three Android launchers (legacy and adaptive), Android splash screens before and after Android 12, web logos/favicons/touch icons, and the design gallery. Notification icons use a flat white leaf mark because Android tints status-bar artwork.

The application IDs are `in.grozo.customer`, `in.grozo.vendor` and `in.grozo.driver`. Register those exact IDs in owned Firebase/Google projects and supply matching ignored client configuration before a configured release. Apps installed under the previous IDs are separate Android applications; they are not upgraded by these builds.
