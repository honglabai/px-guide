# Verified Coupang Bundle Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 쿠팡의 검증된 묶음 표시가를 PX 판매 단위로 환산해, 총액과 배송비를 보존하면서 공개 비교가를 정확히 갱신한다.

**Architecture:** 기존 `sameBundle`과 `comparisonQuantity`는 검색 목표로만 쓰고, 쿠팡 선택 옵션에서 수량을 다시 확인한다. 서버가 일치와 가격 판정을 재계산해 총액과 환산 분모를 D1에 저장한다. 공개 UI는 분모를 반영한 단위 가격으로 비교하고 묶음 총액을 따로 표시한다.

**Tech Stack:** Node.js ESM, Sites Worker/D1, Ego Lite, buildless browser JS, `node:test`.

**Spec:** [2026-10-21-coupang-bundle-comparison-design.md](../specs/2026-10-21-coupang-bundle-comparison-design.md)

## Global Constraints

- `comparisonKind==='sameBundle'`과 양의 안전한 정수 `comparisonQuantity`가 있는 항목만 자동 대상. 불확실한 묶음·중첩 수량·누락 근거는 검토 또는 실패 기록으로 보낸다.
- 온라인 총액 `displayedPrice`와 배송비는 원문 그대로 저장한다. 공개 비교는 `displayedPrice/comparisonQuantity`; PX가와 월별 할인 기록은 그대로 둔다.
- 검색 카드와 상세 선택 옵션의 상품·규격·수량·ID·판매 조건이 일치해야 한다. 쿠폰·와우·카드 조건가는 일반가로 자동 반영하지 않는다.
- 기존 20%/40% 변동 규칙, 차단 시 실행 중단, 최대 20건/회와 한국 시간 5회, 공개 사이트·소유자 인증을 유지한다.
- 이미 적용된 SQL은 수정하지 않고 새 D1 마이그레이션을 추가한다.

## Review Focus

1. 로투스 125g 20개 총액 25,950원은 단위 약 1,298원으로 비교하고 배송비를 별도 표시한다 — Task 1·3 테스트.
2. 삼다수 500ml×20병의 `comparisonQuantity=1`은 20병 묶음 하나로 비교한다 — Task 1·3 테스트.
3. 던킨 400ml 24개와 6개 옵션은 일치하지 않으며 쿠폰 26,310원을 일반가로 승인하지 않는다 — Task 1·2 테스트.
4. PX 판매 단위가 130입이고 온라인 바깥 묶음이 2인 중첩 수량은 자동 승인하지 않는다 — Task 1·2 테스트.
5. 같은 온라인 옵션에서 두 판매자가 다른 가격·배송비를 보이면 낮은 가격을 임의 선택하지 않는다 — Task 2 테스트.

---

## File map

| File | Responsibility |
| --- | --- |
| `price/comparison-basis.mjs` | PX 판매 단위/온라인 바깥 묶음의 안전한 목표와 단위 환산 |
| `build.mjs`, `price/store.mjs`, `price/mcp.mjs`, `price/http.mjs` | 카탈로그 메타데이터, 큐·검증·이력·공개 API |
| `db/schema.ts`, `drizzle/0003_*.sql` | 현재가와 이력의 환산 분모 보존 |
| `price/browser-extract.mjs`, `scripts/collect-coupang-prices.mjs` | 목표 묶음 검색과 선택 옵션 수량 증거 |
| `price/public-prices.js`, `price/public-runtime.js`, `price/admin-ui.js`, product/favorites/shopping files | 환산 단위 가격과 온라인 총액 표시 |

### Task 1: 서버의 비교 단위와 저장 계약

**Files:** Create `price/comparison-basis.mjs`, `tests/comparison-basis.test.mjs`; modify `build.mjs`, `price/store.mjs`, `price/mcp.mjs`, `price/http.mjs`, `db/schema.ts`, server tests; append `drizzle/0003_*.sql` and metadata.

**Interfaces:** `deriveComparisonBasis(product) -> {eligible:boolean,comparisonQuantity:number|null,targetQuantity:string|null,reason:string|null}`; `comparisonUnitPrice(displayedPrice,q) -> number|null`. Claimed batch includes `comparisonQuantity`, derived target `quantity`, and raw-bundle `referencePrice = officialPrice*q`; server observes the same target and derives `q` from its catalog, not from the browser's claim. Public current includes raw `displayedPrice`, `comparisonQuantity`, calculated `comparisonUnitPrice`, shipping, source and date.

- [ ] **Step 1: Write failing tests.** Assert Lotus q20/125g/20개, Samdasu q1/500ml×20병, Dunkin q24/400ml/24개, q2 with inner 130입 ineligible, `unverifiedBundle` ineligible, missing/contradictory count cannot auto accept, static reference scales by q, a changed basis cannot silently update current, and public current preserves raw total plus q and unit price.
- [ ] **Step 2: Run red tests.** `node --test tests/comparison-basis.test.mjs tests/price-store.test.mjs tests/price-http.test.mjs` must fail on the new assertions.
- [ ] **Step 3: Implement.** Put basis derivation and exact integer comparison rules in the new module. Emit kind/q in catalog, add append-only columns and migration, validate observations in MCP against derived target, record q in current and immutable history, and expose calculated unit price from verified rows only. Do not seed an accepted current from `officialPrice`; manual acceptance must not bypass basis validation.
- [ ] **Step 4: Verify.** Run affected tests, inspect migration and built catalog count, then `npm run build`. Commit only Task 1 files.

### Task 2: Ego Lite의 목표 묶음 검색과 관찰

**Files:** Modify `price/browser-extract.mjs`, `scripts/collect-coupang-prices.mjs`, `docs/coupang-price-operations.md`, browser/CLI tests.

**Interfaces:** Consume Task 1 batch `comparisonQuantity` and derived target `quantity`. Emit actual selected title, option count evidence, raw total, shipping, seller, IDs, timestamp and recheck. The collector does not calculate a trusted unit price or write to Site.

- [ ] **Step 1: Write failing fixtures.** Captured Lotus 125g×1 and 125g×20, Dunkin 400ml×24 coupon and ×6, Samdasu 500ml×20 with q1, same-option competing sellers, missing count, and nested count. Assert selected detail count rather than option-menu text determines the result.
- [ ] **Step 2: Run red tests.** `node --test tests/browser-extract.test.mjs tests/browser-dom.test.mjs tests/price-collector-cli.test.mjs` must fail on the new assertions.
- [ ] **Step 3: Implement.** Search for derived target, confirm visible count in card and selected detail, fail closed for ambiguity and conditional pricing, and include enough observed title/quantity for server validation. Keep one TaskSpace per run, no bypass and no Site credentials.
- [ ] **Step 4: Verify.** Run focused tests and a bounded Ego Lite dry run in the approved space if one is available. Record where live verification was impossible; never invent observation evidence. Commit Task 2 files.

### Task 3: 공개·관리 화면의 환산 표시

**Files:** Modify `price/public-prices.js`, `price/public-runtime.js`, `price/admin-ui.js`, `product-ui.mjs`, `product-catalog.js`, `favorites.js`, `product-actions.js`, `build.mjs`, styles and UI tests as needed.

**Interfaces:** Consume Task 1 public `comparisonUnitPrice`, `displayedPrice` and `comparisonQuantity`. All PX 차액·절감률·찜·장바구니 calculations use unit price; detail/admin show raw online bundle total, q, shipping and source separately.

- [ ] **Step 1: Write failing rendering tests.** Lotus 25,950/20 displays about 1,298원 and compares PX 820 against 1,297.5; Samdasu q1 uses full 20병 total; Dunkin 27,600/24 displays 1,150원; shopping/favorites do not use raw bundle totals as one PX unit; no verified price leaves dated static record; shipping is separate and price difference is not labeled unconditional checkout savings.
- [ ] **Step 2: Run red tests.** `node --test tests/public-prices.test.mjs tests/favorites-controls.test.mjs tests/shopping.test.mjs tests/price-admin.test.mjs` must fail on the new assertions.
- [ ] **Step 3: Implement.** Read the verified API price map once, calculate with unit price throughout all public surfaces, show raw bundle evidence on detail/admin, and retain stale (>30 days) and API-failure labels. Keep PX/monthly source fields untouched.
- [ ] **Step 4: Verify.** Run affected UI tests and `npm run build`, inspect generated output, commit Task 3 files.

### Task 4: 종합 검증과 게시 연결

**Files:** No source change unless a concrete integration defect appears.

- [ ] **Step 1:** Run `npm run build` and `node --test --test-concurrency=1 tests/*.test.mjs`; inspect generated catalog, migrations and `git diff --check`.
- [ ] **Step 2:** Resume the original price-refresh plan's Task 7 to publish, verify Site MCP/D1/UI, and only then enable the Mac-local recurring automation.
