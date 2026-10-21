# Demo product imagery and rights inventory

Created 21 October 2026 for this Grozo demonstration. **All twelve images are original AI-generated product illustrations with a photographic appearance, not photographs of real stocked goods or branded packaging.** No external merchant/product photography was downloaded. No association with a manufacturer or real merchant is represented.

Rights basis: output created through OpenAI image generation for this implementation, governed by the account's applicable OpenAI terms ([Terms of Use — Content](https://openai.com/policies/terms-of-use/#content)). These are not Wikimedia/CC0 assets, and we do not invent a third-party author or Creative Commons licence. As between OpenAI and the user, applicable terms assign output rights to the user to the extent permitted by law. Outputs may not be unique. No third-party attribution obligation is attached to a source photograph because no source photograph was used. Keep the AI-generated disclosure in the demo guide.

Source: one original 4×3 asset sheet generated from a prompt specifying unbranded generic groceries on white studio backgrounds, no text/logos/characters. Generation date: 2026-10-21. Authoring process: OpenAI image generation at the user's request; local crop/resize/WebP optimization. It is not original camera photography. Source-sheet SHA-256 and every derived-file checksum are recorded in [product-images.json](../../demo/product-images.json).

| File under `demo/assets/products/` | Depicted generic product | Source / author / licence basis |
| --- | --- | --- |
| milk.webp | Unlabelled glass milk bottle | Original generated output; terms above |
| bananas.webp | Bananas | Same |
| flour.webp | Flour in plain paper sack | Same |
| eggs.webp | Eggs in plain tray | Same |
| rice.webp | Rice in plain sack | Same |
| bread.webp | Bread in unbranded transparent bag | Same |
| oil.webp | Cooking oil in unlabelled bottle | Same |
| biscuits.webp | Plain biscuits | Same |
| tea.webp | Loose tea leaves | Same |
| oranges.webp | Oranges | Same |
| cleaner.webp | Unbranded cleaning spray | Same |
| tomatoes.webp | Tomatoes | Same |

All images are 480×480 WebP, aspect-preserving with white padding. Combined size is approximately 159 KB. They live in the repository as server/demo assets, **not Flutter application assets**. `seed:demo` verifies their hashes and copies them to the existing configured upload store using content-derived names. Catalog URLs use the configured local/owned image origin; no remote image hotlinks are required. Existing no-image/error fallbacks remain.

The screenshot harness decodes these same files through a test-only HTTP transport. Actual production image widgets perform the rendering; application screenshots are not generated images. Admin screenshots fetch the files from the real local API. Do not describe these assets as externally licensed brand-packaging photographs or proof of physical product stock.
