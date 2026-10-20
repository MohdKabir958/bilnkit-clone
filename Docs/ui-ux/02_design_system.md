# Grozo design system

Approved logo: `branding/assets/grozo-logo.png`. Internal `kraveo_ui` names remain compatible.

| Role | Light | Delivery dark |
| --- | --- | --- |
| Canvas | #F6F8F6 | #080D09 |
| Surface | #FFFFFF | #111812 |
| Alternate | #EEF3EF | #1A241C |
| Border | #DDE5DF | #26322A |
| Text | #14201A | #F4F7F2 |
| Secondary | #46534B | #B4BFB6 |
| Quiet text | #58675E | #A3B2A7 |
| Action | #005A26 | #43AE55 |
| Accent | #85D900 | #85D900 |
| Success | #176B37 | #86D69B |
| Warning | #865000 | #FFCE7A |
| Error | #B42332 | #FFA6AC |
| Information | #245CA2 | #A6CDFF |

Accent pairs with dark text. States include labels/icons. Values must be real: no invented ETA, ratings, savings, stock, discount or earnings.

4-point spacing: 4/8/12/16/20/24/32/40/48. Mobile gutter20. Radii8/12/16/24. Restrained elevation. Jakarta for UI, operational headings and prices; Bricolage for promotional display. Body15/22, compact13/18, caption12/17, section21/28. Bundled Noto Sans Devanagari provides Hindi fallback under SIL OFL1.1.

Persistent navigation labels. Stable-width add/quantity controls with44px height. Primary actions52px minimum, delivery64px. Buttons grow with text. Preserve system text scaling and respect reduced motion for shared presses, navigation, reveals, number transitions and skeletons.

Contain product images on quiet surfaces, resize cached network decoding and use explicit missing-image fallbacks. Strike MRP only when greater than price. Preserve closed/unavailable states, confirmations, loading, retry, financial authorization and server validation. Label draft estimates separately from final checkout quotes.
