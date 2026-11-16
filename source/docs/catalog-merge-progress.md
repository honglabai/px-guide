# Reviewed catalog merge — 2026-10-25

Scope: the 26 strong groups in the 2026-10-24 review only. Preserve 47 October / 10 September offers, all aliases, and user quantities/check states. No administrator-mode implementation.

Baseline: e1d32575b8f761cb8826d47e2f3ef3c047ae0c72; 197 tests passed. Source backup: catalog/merge-baseline-20261025.json. Runtime backup must precede mutation.

Tasks: 1 canonical data merge and regression tests; 2 runtime transaction and backups; 3 browser aliases and quantity preservation; 4 full checks, independent review, deployment and live verification.

Ruling: execute only the 26 strong reviewed groups; leave conditional candidates unchanged. Publication is authorized by the user request and Sites workflow. Retain historical codes and slugs as aliases rather than renumbering.

Task 1 complete: source master 2311, cards2309, source2306; 26 legacy codes/slugs retained; 47 October/10 September records unchanged.
Task 2 complete locally: append-only schema migration, authenticated prepare/apply/verify, 17-table backup and atomic patch tested with injected SQL failure.
Task 3 complete: aliases load before favorites; same-state quantities coalesce, mixed-check/overflow lines stay separate; old tabs use immutable legacy cards.
Verification: 207/207 tests; normal build succeeded.
Ruling: mixed purchased/pending states or combined quantity above99 retain separate local list lines so no completion state or quantity is discarded; source catalog is still deduplicated.

Final independent review found three Important issues, none Critical/Minor. All fixed in one pass: missing default-cart persistence (generated-script VM RED→GREEN); incompatible current-price overwrite (real SQL RED→GREEN); queue-claim race (injected concurrent claim RED→GREEN). Full suite211/211 and normal build pass. Production verification, environment configuration, actual routing and runtime backup/application remain execution checks, not review assumptions. Recovery data is preserved; no destructive recovery is being executed against live traffic.
