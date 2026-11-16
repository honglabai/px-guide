# Task 1 report — verified bundle comparison basis

Implemented the catalog, server, API, and append-only D1 contract for a raw Coupang bundle price and its verified PX-unit divisor.

## Red and green evidence

- Initial `node --test tests/comparison-basis.test.mjs tests/price-store.test.mjs tests/price-http.test.mjs`: 5 failures, including the missing basis module, unscaled claim reference, missing catalog kind/q, and missing public q/unit price.
- A later regression test for a legacy current row with `comparison_quantity IS NULL` failed with `ACCEPT` instead of `REVIEW`. The server now reads raw current basis before deciding.
- Final `node --test --test-concurrency=1 tests/*.test.mjs`: **120 passed, 0 failed**.
- Final `npm run build`: succeeded (`Built 40 guides and 47 monthly deals`).
- Built catalog: 2,278 products; 1,848 eligible under the conservative basis derivation, 54 documented `sameBundle` entries excluded for nested inner/outer counts.
- `git diff --check`: clean.

## Self-review

- `comparisonQuantity` is the outer count of PX sale units. A single PX pack with an explicit inner count retains that count as its online target; an explicit inner count with outer q>1 is ineligible.
- Catalog q provides a search target. The server rechecks observed title, quantity, option, and catalog basis; missing or contradictory counts cannot auto accept or be manually accepted.
- Batch `referencePrice` scales per-unit static price by q. The first anomaly check compares raw bundle totals. Change thresholds use integer arithmetic.
- History and current preserve raw displayed total, q, shipping, and source. Public current adds `comparisonUnitPrice`; legacy current rows with no q are hidden from the public API and cannot be silently overwritten.
- A catalog basis change produces `REVIEW`, preserves the prior current row, and blocks manual approval of an observation on the wrong basis.

## Limits and handoff

- The basis parser intentionally narrows coverage when product source text contains ambiguous or nested counts; those records need curation or richer online evidence.
- Task 2 still needs to collect visible selected-option count evidence. Task 3 still needs to use public `comparisonUnitPrice` in all UI comparisons.
- Generated `dist/` output was verified but excluded from this focused source commit; the later integration build will regenerate it.

## Review fixes

Four blocking review findings were reproduced and fixed in a follow-up commit:

- Count parsing now recognizes `ea`, `정`, `매`, and `포` in both basis derivation and match scoring. The regression rejected `5g*20ea` at q5 and equivalent tablet, sheet, and sachet nested packs. The built catalog now has 1,773 eligible rows, 123 nested exclusions, and 6 contradictory inner-count exclusions.
- A selected detail price must be identified as an ordinary price. Coupon, Wow, and card conditions become review records, with manual acceptance blocked.
- A stored catalog-basis fingerprint covers PX name, specification, inner count, option, target count, and outer q. A q1 change from 20병 to 24병 now produces `COMPARISON_BASIS_CHANGED`, preserving current and preventing manual approval. Legacy rows without a fingerprint also require review.
- Successful observations carry a separate `searchCard` object. The server checks both count/spec matches, exact product/item/vendor identity, raw displayed price, and shipping against selected detail. Detail seller is required; card seller is optional but must agree when present. Missing or conflicting evidence goes to review and cannot be manually accepted. The search card and basis fingerprint are retained in immutable history; the fingerprint is also retained in current.

Red evidence: the new tests initially failed with nested `ea` accepted, conditional price `ACCEPT`, changed q1 pack `ACCEPT`, and absent search card `ACCEPT`. Green evidence: focused server/rules suite **59/59 passed**, full suite **123/123 passed**, and `npm run build` succeeded. Migration `0004_verified_offer_evidence.sql` was applied by the server test fixtures. `git diff --check` was clean.
