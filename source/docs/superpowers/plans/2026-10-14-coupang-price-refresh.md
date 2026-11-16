# Coupang Price Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mac의 Ego Lite가 하루 5회 쿠팡에서 상품별 가격을 검색·검증하고 PX 구매 가이드에 승인된 현재가를 표시한다.

**Architecture:** 상품의 원본은 `content/products.json`에 유지하고, 조회 큐·관찰 이력·승인 현재가는 Sites D1에 둔다. 로컬 Codex 자동 작업이 Ego Lite로 후보를 관찰한 뒤 소유자 전용 Site MCP 도구에 제출한다. 공개 화면은 D1 현재가를 읽으며 실패·미확인 가격은 날짜가 있는 기록으로 표시한다.

**Tech Stack:** Node.js ESM, Cloudflare Worker, Sites D1/Drizzle, buildless HTML/JS, Ego Lite CLI, Codex 로컬 자동 작업, `node:test`.

**Spec:** [2026-10-14-coupang-price-refresh-design.md](../specs/2026-10-14-coupang-price-refresh-design.md)

## Global Constraints

- `Asia/Seoul` 07:00, 10:00, 13:00, 16:00, 20:00; 실행당 최대 20개, 놓친 실행의 일괄 보충 없음.
- 모든 대상은 이름·브랜드·규격으로 쿠팡 검색 후 상세 옵션 확인; 기존 URL은 후보 대조에 사용.
- 일치 점수: 브랜드 15, 제품명 35, 용량 20, 구성 수량 20, 옵션 10. 용량·수량 불일치 시 자동 반영 금지. 95점 이상 자동 가격 판정, 85~94점 검토, 85점 미만 미반영.
- 마지막 승인값 대비 변동률 20% 이하 자동, 20% 초과~40% 이하 재검증 후 반영, 40% 초과 검토. 첫 승인 전 정적 가격과도 이상치를 비교.
- `BLOCKED`, `CAPTCHA`, `LOGIN_REQUIRED`에는 즉시 실행 중단; 다른 계정·세션으로 우회 금지.
- 쿠폰·와우 전용가를 일반가로 자동 반영하지 않음. 판매가와 배송비는 별도 저장. 30일 지난 현재가는 `재확인 필요` 표시.
- 사이트는 공개 상태 유지. 쓰기와 관리자 화면은 Sites가 검증한 로그인 이메일을 서버에서 소유자 허용 목록과 비교. 비밀은 소스·자동 작업 프롬프트에 저장하지 않음.
- `content/products.json`의 PX가·월별 할인 기록과 기존 `officialPrice`는 갱신 작업이 수정하지 않음.

## Review Focus

1. 이름은 맞지만 400ml 낱개와 400ml×6개가 다른 후보 → Task 1의 `hardMismatch` 테스트가 자동 반영을 막는다.
2. 검색 카드와 상세의 선택 `itemId`가 다른 후보 → Task 6의 옵션 URL/상세 재확인 테스트가 관찰을 거부한다.
3. 동일 125g×1개에 표시가와 배송비가 다른 판매자가 둘 이상인 경우 → Task 6의 판매자·배송비 분리 및 큰 가격 차이 검토 테스트가 가격 혼동을 막는다.
4. 공개 API 실패 또는 30일 넘은 승인값 → Task 4의 과거 기록·재확인 문구 테스트가 최신가로 오인하지 않게 한다.
5. 겹친 자동 실행·잠금 만료·Mac 재시작 → Task 2의 원자적 최대 20개 예약 테스트가 중복 처리와 영구 잠금을 막는다.

---

## File Map

| File | Responsibility |
| --- | --- |
| `price/rules.mjs` | 상품 정규화, 100점 일치도, 가격 변동 판정 |
| `db/schema.ts`, `drizzle/0001_*.sql` | D1 가격·큐·익명 인기 합계 스키마 |
| `price/store.mjs` | D1 큐 예약, 관찰·검토 이력, 승인 현재가, 인기 합계 |
| `price/http.mjs`, `price/mcp.mjs` | 공개 읽기, 소유자 관리 API, Site MCP JSON-RPC |
| `price/browser-extract.mjs`, `scripts/collect-coupang-prices.mjs` | Ego Lite 결과 추출과 실행당 최대 20개 수집 |
| `price/public-prices.js`, `price/admin-ui.js` | 공개 가격 반영, 관리자 검토 화면 |
| `build.mjs`, `product-ui.mjs`, `product-catalog.js`, `favorites.js`, `product-actions.js`, `content/design-system.css` | 정적 가격의 날짜 표시와 동적 현재가 반영 |
| `worker/index.js`, `.openai/hosting.json` | API/MCP 라우팅과 Site 기능 선언 |

### Task 1: 판정 규칙과 데이터 스키마

**Files:** Create `price/rules.mjs`, `tests/price-rules.test.mjs`; modify `db/schema.ts`; generate `drizzle/0001_*.sql` and metadata.

**Interfaces:** `matchCandidate(product, candidate) -> {score:number,hardMismatch:boolean,reasons:string[]}`; `decidePrice({match,observedPrice,previousPrice,reverified}) -> {status:'ACCEPT'|'REVERIFY'|'REVIEW'|'REJECT',reason:string}`. `product` and `candidate` use `name`, `brand`, `spec`, `quantity`, `option`; prices are positive integer KRW.

- [ ] **Step 1: Write failing tests.** Assert exact 125g×1개 is 95+; 400ml×6개 versus 400ml×1개 has `hardMismatch`; scores 84/85/94/95 cross the specified boundary; 20/20.01/40/40.01% changes choose ACCEPT/REVERIFY/REVIEW; missing unit never becomes an exact match.
- [ ] **Step 2: Run red test.** `node --test tests/price-rules.test.mjs` → missing module or assertion failure.
- [ ] **Step 3: Implement `price/rules.mjs` and schema.** Add `coupang_price_current`, `price_history`, `price_update_queue`, `product_interest_daily` with `product_slug` keys, timestamp and status columns from the spec. Use a new migration; never edit `0000_supreme_ozymandias.sql`.
- [ ] **Step 4: Generate migration and run green test.** `node /Users/kobujang/.codex/plugins/cache/openai-curated-remote/sites/1.0.1/scripts/install-dependencies.mjs`, then `npx drizzle-kit generate` and `node --test tests/price-rules.test.mjs`; inspect generated SQL for four tables and indexes.
- [ ] **Step 5: Commit.** Commit only rule, schema, migration, and test files.

### Task 2: 큐와 가격 저장소

**Files:** Create `price/store.mjs`, `tests/price-store.test.mjs`; modify `build.mjs` to emit `dist/client/price-catalog.json` from `content/products.json`.

**Interfaces:** `seedPriceQueue(db,catalog,offset,limit) -> Promise<number>`; `claimPriceBatch(db,catalog,now,limit=20) -> Promise<BatchItem[]>`; `recordObservation(db,observation,decision,now) -> Promise<void>`; `listCurrentPrices(db,slugs) -> Promise<CurrentPrice[]>`; `reviewObservation(db,{historyId,action,reviewer,now}) -> Promise<void>`. `BatchItem` includes `slug,name,brand,spec,existingCoupangUrl,previousPrice`. All writes use `db.prepare(...).bind(...).run()` or D1 `batch()`.

- [ ] **Step 1: Write failing in-memory SQLite tests.** Apply generated migration through a small `node:sqlite` D1-shaped adapter; assert seeding two overlapping catalog batches creates one queue row per slug, simultaneous claims reserve each slug once and return at most 20, expired `RUNNING` locks return to queue, a duplicate observation ID cannot create two current rows, and review decisions append history rather than overwrite observations.
- [ ] **Step 2: Run red test.** `node --test tests/price-store.test.mjs` → missing store functions.
- [ ] **Step 3: Implement store and catalog emission.** Queue sort uses current-month discount, `product_interest_daily` counts, prior price variance, and age; give overdue items a minimum priority. Reserve with an atomic conditional update and a finite lock expiry. Parse only `coupang.com` subdomains from existing source URLs. Do not seed current prices from `officialPrice`.
- [ ] **Step 4: Run green tests and build.** `node --test tests/price-store.test.mjs && node build.mjs`; verify catalog count is 2,278 and current price tables remain empty after migration.
- [ ] **Step 5: Commit.** Commit store, catalog generation, and tests.

### Task 3: 공개 API, 관리자 인증, Site MCP

**Files:** Create `price/http.mjs`, `price/mcp.mjs`, `tests/price-http.test.mjs`; modify `worker/index.js`, `.openai/hosting.json`.

**Interfaces:** `handlePriceHttp(request,env) -> Promise<Response|null>` handles `GET /api/prices?slugs=...`, owner `GET /api/admin/prices`, owner `POST /api/admin/prices/review`, and public `POST /api/interest`; `handleMcp(request,env) -> Promise<Response>` handles `server/discover`, `tools/list`, `tools/call`. MCP tools: `seed_price_queue({offset,limit})`, `get_price_batch({limit})`, `submit_price_observations({observations})`, `review_price_observation({historyId,action})`. Owner identity comes only from Sites `oai-authenticated-user-email` and `env.PRICE_ADMIN_EMAIL`.

- [ ] **Step 1: Write failing request tests.** Public GET returns only accepted prices; anonymous or non-owner admin POST/MCP calls return 403 while validated public interest events remain allowed; owner can seed, list and submit; malformed slug/price/URL and observation batches over 20 return 400; `tools/list` advertises only the four named tools. Assert visitor counter and asset routes still work.
- [ ] **Step 2: Run red test.** `node --test tests/price-http.test.mjs` → absent routes/tools.
- [ ] **Step 3: Implement router and MCP.** Add `"mcp"` capability to `.openai/hosting.json` without removing `d1`. Read `price-catalog.json` through `env.ASSETS` for seeding and claims. Use `PRICE_ADMIN_EMAIL` only at runtime; do not include its value in source. Limit public GET to 100 slugs and set `Cache-Control: no-store`.
- [ ] **Step 4: Run green and regression tests.** `node --test tests/price-http.test.mjs tests/launch.test.mjs tests/product-images.test.mjs` → all pass.
- [ ] **Step 5: Commit.** Commit router, Site manifest, and tests.

### Task 4: 승인 현재가와 확인일 표시

**Files:** Create `price/public-prices.js`, `tests/public-prices.test.mjs`; modify `product-ui.mjs`, `product-catalog.js`, `favorites.js`, `product-actions.js`, `build.mjs`, `content/design-system.css`.

**Interfaces:** Browser `fetchCurrentPrices(slugs) -> Promise<Map<string,CurrentPrice>>`; `mergeCurrentPrices(products,current) -> Product[]`; `applyVisiblePrices(root,current) -> void`. Each built product card/detail carries `data-price-slug`; accepted D1 current values replace comparison numbers, while the old `officialPrice` appears only as a dated record when no accepted value exists.

- [ ] **Step 1: Write failing rendering tests.** After `node build.mjs`, assert a detail without D1 data says `2026-09-29 기록가` rather than current Coupang price; accepted 1,260원 for 125g×1개 produces correct difference and `쿠팡 확인 10.14`; 31-day-old value says `재확인 필요`; API failure leaves a dated record; favorites/cart totals use the accepted value.
- [ ] **Step 2: Run red test.** `node --test tests/public-prices.test.mjs` → missing module or assertion failure.
- [ ] **Step 3: Add client price loader and rendering hooks.** Update static cards, search catalog, detail, action dialog, favorites, shopping, and price comparison calculations from one accepted-price map. Do not change PX price fields or monthly archive markup.
- [ ] **Step 4: Run green, build and existing UI tests.** `node build.mjs && node --test tests/public-prices.test.mjs tests/favorites-controls.test.mjs tests/shopping.test.mjs tests/subcategories.test.mjs` → all pass.
- [ ] **Step 5: Commit.** Commit public display changes and tests.

### Task 5: 관리자 검토와 익명 인기 신호

**Files:** Create `price/admin-ui.js`, `tests/price-admin.test.mjs`; modify `build.mjs`, `favorites.js`, `worker/index.js`, `content/design-system.css`.

**Interfaces:** Admin page `GET /admin/coupang-prices/` loads the owner-only review API; decisions call `POST /api/admin/prices/review`. Favorite/cart addition sends `{slug,kind:'favorite'|'shopping'}` to `POST /api/interest` once per day per browser action, with no saved user list.

- [ ] **Step 1: Write failing tests.** Non-owner cannot obtain the admin page or review data or approve; approval appends decision history and updates current; rejection leaves current unchanged; browser-side dedupe sends at most one interest event per slug/kind/day; bad slug/kind rejects. Built privacy page describes aggregate counts while confirming lists stay local.
- [ ] **Step 2: Run red test.** `node --test tests/price-admin.test.mjs` → missing UI/handler behavior.
- [ ] **Step 3: Implement review list/actions and interest aggregation.** Intercept `/admin/coupang-prices/` in Worker and reject non-owners before serving the static shell. Show source URL, seller, shipping, score, old/new price and reason; confirm approval or rejection on server. Add a small daily browser dedupe key; store only per-product daily totals in D1. Update `/privacy/` copy.
- [ ] **Step 4: Run green and build checks.** `node build.mjs && node --test tests/price-admin.test.mjs tests/favorites-controls.test.mjs` → all pass.
- [ ] **Step 5: Commit.** Commit admin, interest, privacy, and tests.

### Task 6: Ego Lite 검색 수집기

**Files:** Create `price/browser-extract.mjs`, `scripts/collect-coupang-prices.mjs`, `tests/browser-extract.test.mjs`, `docs/coupang-price-operations.md`.

**Interfaces:** `parseSearchCard({text,url}) -> Candidate|null`; `parseDetail({text,url}) -> Detail|{blocked:'BLOCKED'|'CAPTCHA'|'LOGIN_REQUIRED'}`; `collectBatch(taskSpace,batch) -> Promise<Observation[]>`. CLI accepts a local JSON batch file, writes observation JSON to stdout, and never receives a Site credential. The Codex automatic task submits observations through MCP.

- [ ] **Step 1: Write failing fixture tests.** Search card 125g×1개 preserves item/vendor IDs; detail price 1,260원 and 배송비 3,000원 remain separate; 400ml×6개 does not pass a 400ml×1개 target; changed detail item ID, two conflicting exact sellers, missing price, and CAPTCHA produce review/error observations instead of auto current prices. A 25% change reads the same detail a second time and marks `reverified` only when both reads agree.
- [ ] **Step 2: Run red test.** `node --test tests/browser-extract.test.mjs` → absent parser.
- [ ] **Step 3: Implement one TaskSpace per run and reuse its page.** For every claimed item search name+brand+spec, inspect candidates and exact detail; use `previousPrice` to re-read the same option once for a 20% 초과~40% 이하 change. Pause between requests, stop the entire run on block/login/CAPTCHA; call `task.finish({keep:[]})` after successful completion. Record the browser invocation and the Mac-awake limit in operations doc.
- [ ] **Step 4: Run green and bounded live probe.** `node --test tests/browser-extract.test.mjs`; with Ego Lite, dry-run the linked 400ml drink and unlinked 125g biscuit without writing Site data. Confirm count mismatch is rejected and shipping stays separate.
- [ ] **Step 5: Commit.** Commit parser, collector, operations doc, and tests.

### Task 7: Publish, verify, and enable local recurrence

**Files:** No source changes unless verification finds a defect. The local Codex automation contains only the run objective and references the committed operations doc; it contains no credentials.

**Interfaces:** Published Site exposes `get_price_batch` and `submit_price_observations` through its provisioned MCP plugin. Automatic run: claim ≤20 → Ego Lite collect → submit → read back outcomes. Schedule in `Asia/Seoul` at 07:00, 10:00, 13:00, 16:00, 20:00.

- [ ] **Step 1: Run complete local verification.** `node build.mjs && node --test tests/*.test.mjs` → all pass; inspect the build output and migration; `git status --short` contains only intended changes.
- [ ] **Step 2: Publish through the Sites source workflow.** Push exact commit, package archive, save version and deploy while preserving the existing public access mode. Check deployment status and hosted D1 tables.
- [ ] **Step 3: Verify live writer access and UI.** Connect the Site MCP plugin if needed; seed the queue, claim at most two sample items, submit the Ego Lite observations, read current/history/queue and public page. Verify non-owner write rejection. Roll back a wrong sample through review rather than editing D1 directly.
- [ ] **Step 4: Create the local Codex heartbeat.** Recheck existing automations to avoid duplication; set five KST times and a prompt that executes `docs/coupang-price-operations.md`, stays quiet if no action is needed, and reports failures requiring attention. Keep the Site public.
- [ ] **Step 5: Run one immediate task-path verification and hand off.** Execute the same local collection path once without waiting for a scheduled occurrence; confirm ≤20 writes, readback, saved timing and enabled status. Report the live Site URL, last successful observation, and Mac-awake limitation.
