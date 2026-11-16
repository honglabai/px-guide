# Approved classification review (2026-10-25 KST)

Scope: the user approved the numbered report in `catalog/category-review.json`.
Apply 239 corrections and 24 refinements; leave all 53 additional-verification items unchanged.

- Preserve all 2,311 master IDs/slugs, 2,306 source records, 2,309 cards.
- Preserve prices, images, descriptions, tax type, monthly documents and 47 October discount records.
- Add ten leaf categories using unused six-digit category codes. Append category rows without renumbering existing IDs.
- Issue 263 new twelve-digit product codes; preserve every former code as an inactive alias to the same product ID.
- Correct source/card category, subcategory and same-product group values, retaining existing screen tab labels.
- Registry overrides prevent the reviewed values being replaced by the old manufacturer/name keyword guesses.
- Archive canonical tables and state before live migration; verify all 12 table fingerprints, foreign keys and active version.
- Support pre-merge, pre-classification and current immutable API versions during rollout.

Source dataset: `483d83d212e5f65e3b588fba`.
Target dataset: `5c0f0f3a4504112b2dc2e9b2`.
Migration is authenticated and idempotent. The temporary category token is removed after verification.

Validation: transformation and runtime regressions, complete repository suite, build, live fingerprint comparison, public API card/code compatibility checks.

Independent review found two regression risks; both reproduced with failing tests and fixed: preserve existing hotpack special-case precedence during recompilation, and include merged legacy-slug aliases in immutable snapshots. No other important findings.

Historical merge tests now use the immutable post-merge/pre-classification baseline; the approved later classification changes have separate preservation tests.

## Completed live verification
- All 12 canonical table fingerprints match the target; no foreign-key errors.
- All 2,309 public cards match the rebuilt DB and all 263 previous product codes resolve correctly.
- Pre-classification and current-version merged slug aliases resolve to the same canonical product.
- 47 October discount records remain intact; 53 pending classification findings remain unchanged.
- The temporary runtime environment key was removed. The one-off HTTP migration route is also permanently closed after successful activation.
