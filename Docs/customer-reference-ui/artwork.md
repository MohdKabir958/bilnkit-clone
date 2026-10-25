# Category artwork inventory

| Field | Value |
| --- | --- |
| Asset | apps/customer_app/assets/catalog/category-atlas.png |
| Dimensions | 1983 × 793, PNG with transparency |
| Size | 1,315,606 bytes |
| SHA-256 | d7b08c8c52f986bfc2593fc18aac683fc692c0546243ed2cf9aec6ac8c5a5d67 |
| Source | Original OpenAI image-generation output created for Grozo on 25 October 2026 |
| Author/source credit | AI-generated artwork commissioned for this implementation; no external photographer |
| External licence/attribution | No third-party stock image, merchant packaging, logos or external image licence used; generated output is subject to the applicable OpenAI service terms |

The ten objects depict produce, dairy/eggs, grains, snacks, personal care, household, bakery, fish, frozen goods and more. They are decorative category icons, not claims about a particular merchant/product. The reference supplied by the user informed the visual style; its pixels were not packaged as the app UI.

Flutter decodes this one atlas through its image cache and paints the relevant cell for each tile. Source images are not duplicated per category. Category backgrounds, labels, cards, the white leaf mark and all controls are actual Flutter drawing/widgets. The normal decode target is 1000px across; the source stays intact. Existing original demo product photography-style illustrations are documented separately in `../demo/product-image-licenses.md`.
