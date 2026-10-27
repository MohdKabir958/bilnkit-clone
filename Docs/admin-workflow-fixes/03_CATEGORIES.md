# Categories without leaving Add Vendor

Search the primary category picker or choose + Create category. The existing category form and administrator service handle name, icon, store/product purposes, active state and Show on Customer Home. The wizard retains all store fields and auto-selects a new eligible store category. Duplicate-name conflicts can select an existing eligible category. Inactive or product-only categories are saved without assigning an invalid primary category.

The backend now counts primary store assignments as well as secondary links, deduplicating stores that use both. Primary assignments participate in purpose restrictions, rename and merge handling. Store creation rechecks category validity under a shared lock; changes invalidate public category caches. Customer filtering can match products in a primary-categorized store rather than incorrectly stopping after a failed primary-name match. Existing sorting, public visibility checks and icon fallbacks remain.

Creating a category now explicitly accepts isActive (boolean). The former regression assertion that any isActive on create was invalid was revised to reject a non-boolean instead; this is a legitimate requested contract extension. Default active behavior remains true. No authorization checks were relaxed.

Verified: 11 focused admin tests pass; admin TypeScript passes. New PostgreSQL primary-visibility and existing category regressions require the isolated database. The new customer category regression could not run: Flutter test --no-pub failed binding its local tester socket under the sandbox before executing tests. This is not a passing Flutter result. No personal account is used.
