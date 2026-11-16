# Product DB migration ledger

Plan: PX_상품DB_화면유지_효율화계획_2026-10-24.md, revised with 3-level classification and numeric codes.

- Baseline: live v136 f9fb02d. Remote v137 contains rejected P0 wording; working tree restored to v136 before implementation. History remains forward-only.
- Isolated checkout/branch: px-db-source / product-db-migration. Existing .sites-checkout untouched.
- Live DB: coupang_price_current, price_history, price_update_queue, product_interest_daily, daily_visits. Current price and queue tables empty at inspection. Existing operational records will not be deleted.
- Ruling: keep existing dynamic pricing tables and their external Coupang product_id semantics. New catalog integer keys use distinct catalog tables and an alias map; no destructive rename of existing API/vendor identifiers.
- Ruling: normalized canonical catalog is lossless; source descriptions, images, legacy facets and URLs are reconstructed exactly. Runtime D1 seed is separate from schema migration and activates only after complete checks.
- Preview attempt: official sites-preview reports no dev script/static directory. Do not change valid Worker hosting to bypass this limit. Verify generated HTML/CSS, real SQLite/D1 adapter flows and deployed browser UI.

- Baseline 183/183 tests passed. Compiler and real SQLite repository compare all 2318 source products, 2335 card records and all three monthly documents without loss; 2337 stable identities including archived-only records.
- 2392 HTML/CSS files match v136 after removing only the new nonvisual loader script. Card objects match exactly.
- New catalog: 8 major / 58 middle / 105 leaf categories; 171 total nodes, 2337 codes, 57 month/product records, 669 brands. No screen facet names changed.
- Canonical source is catalog/database.json + registry.json; content product/monthly files become generated compatibility inputs, excluded from source tracking. Existing operational D1 tables retain vendor IDs, gain nullable integer catalog links.
- Test corrections: VM realm array prototypes normalized in one assertion; actual value comparison unchanged. Price-index render feedback loop was reproduced RED and fixed GREEN with a dedicated runtime test.
- Official preview unavailable (valid Worker has no dev command). Real browser baseline captured on production; deployed DB and card UI will be checked after activation, with v136 available for rollback.

- Review fixes: generated source directories now created on clean checkout (RED→GREEN); selective multi-tab list changes hydrate missing products before totals (RED→GREEN). Async category/page hydration parity test added.
- Fresh reviewer completed source review. Fixed: clean checkout directory creation (regression RED→GREEN), cross-tab selective loading before totals (regression RED→GREEN), silent trailing card loss guard (regression RED→GREEN). No remaining current-data blocker reported.
- Ruling: UI/browser-device verification uses automated DOM parity and a production cloud Chrome session; actual iPhone Safari hardware is unavailable and will not be claimed as tested.
- Final selective-transfer refinement: list/card batches fetch only the tiny version manifest, not the 529 KB search index; regression RED→GREEN. Immutable version-scoped card responses reuse browser cache; dynamic prices and failed/unready responses remain no-store.
