import { deriveComparisonBasis, comparisonUnitPrice, comparisonBasisKey } from './comparison-basis.mjs';
const LOCK_MS = 30 * 60 * 1000;
const query = (db, sql, ...args) => db.prepare(sql).bind(...args);
const rows = async (db, sql, ...args) => (await query(db, sql, ...args).all()).results;
const first = (db, sql, ...args) => query(db, sql, ...args).first();
const run = (db, sql, ...args) => query(db, sql, ...args).run();
const iso = value => new Date(value).toISOString();
const json = value => value == null ? null : JSON.stringify(value);
const catalogItems = catalog => Array.isArray(catalog) ? catalog : catalog.products ?? [];

function coupangUrl(product) {
  for (const value of [product.existingCoupangUrl, product.productUrl, product.officialPriceUrl]) {
    try {
      const url = new URL(value);
      if (url.protocol === 'https:' && (url.hostname === 'coupang.com' || url.hostname.endsWith('.coupang.com'))) return url.href;
    } catch { /* source has no usable Coupang URL */ }
  }
  return null;
}

export async function seedPriceQueue(db, catalog, offset = 0, limit = 100) {
  const items = catalogItems(catalog).slice(offset, offset + limit);
  const now = new Date().toISOString();
  let created = 0;
  for (const item of items) {
    const result = await run(db, `INSERT OR IGNORE INTO price_update_queue (product_slug, status, priority, created_at, updated_at) VALUES (?, 'PENDING', 0, ?, ?)`, item.slug, now, now);
    created += result.meta?.changes ?? result.changes ?? 0;
  }
  return created;
}

function priority(item, now, queue, interest, prices) {
  const variance = prices?.length === 2 && prices[1] > 0 ? Math.min(30, Math.round(Math.abs(prices[0] - prices[1]) / prices[1] * 100)) : 0;
  const checked = queue.last_checked_at ?? queue.created_at;
  const ageDays = Math.max(0, Math.floor((Date.parse(now) - Date.parse(checked)) / 86400000));
  const discount = item.monthlyDiscount && (!item.discountMonth || item.discountMonth === now.slice(0, 7)) ? 100 : 0;
  return discount + Math.min(50, interest * 2) + variance + Math.min(60, ageDays * 2) + (ageDays >= 30 ? 40 : 0);
}

export async function claimPriceBatch(db, catalog, now, limit = 20) {
  const timestamp = iso(now);
  const cap = Math.min(20, Math.max(0, limit));
  if (!cap) return [];
  const bySlug = new Map(catalogItems(catalog).map(item => [item.slug, item]));
  const pending = await rows(db, `SELECT * FROM price_update_queue WHERE (status IN ('PENDING','RETRY','DONE') AND (next_attempt_at IS NULL OR next_attempt_at <= ?)) OR (status = 'RUNNING' AND lock_expires_at <= ?)`, timestamp, timestamp);
  const interestRows = await rows(db, `SELECT product_slug, SUM(favorite_adds + shopping_adds) AS total FROM product_interest_daily WHERE day >= ? GROUP BY product_slug`, new Date(Date.parse(timestamp) - 30 * 86400000).toISOString().slice(0, 10));
  const interestBySlug = new Map(interestRows.map(row => [row.product_slug, Number(row.total)]));
  const recentPrices = await rows(db, `SELECT product_slug, observed_price FROM (SELECT product_slug, observed_price, ROW_NUMBER() OVER (PARTITION BY product_slug ORDER BY id DESC) AS position FROM price_history WHERE status = 'ACCEPT' AND observed_price IS NOT NULL) WHERE position <= 2 ORDER BY product_slug, position`);
  const pricesBySlug = new Map();
  for (const row of recentPrices) {
    if (!pricesBySlug.has(row.product_slug)) pricesBySlug.set(row.product_slug, []);
    pricesBySlug.get(row.product_slug).push(row.observed_price);
  }
  const ranked = [];
  for (const queue of pending) {
    const item = bySlug.get(queue.product_slug);
    if (item) ranked.push({ queue, item, priority: priority(item, timestamp, queue, interestBySlug.get(item.slug) ?? 0, pricesBySlug.get(item.slug)) });
  }
  ranked.sort((a, b) => b.priority - a.priority || (a.queue.last_checked_at ?? '').localeCompare(b.queue.last_checked_at ?? '') || a.item.slug.localeCompare(b.item.slug));
  // Reserve 80% for oldest eligible work: at five 20-item runs per day,
  // 1,773 products can rotate in about 23 days even under constant demand.
  // The remaining slots retain discount, interest and variance ranking.
  const lastTurn = entry => entry.queue.last_attempt_at ?? entry.queue.last_checked_at ?? entry.queue.created_at;
  const oldest = ranked.filter(entry => deriveComparisonBasis(entry.item).eligible)
    .sort((a,b) => lastTurn(a).localeCompare(lastTurn(b)) || b.priority-a.priority || a.item.slug.localeCompare(b.item.slug));
  const rotationSlots = Math.ceil(cap * 0.8);
  const claimedSlugs = new Set();
  const claimed = [];
  // Try the oldest phase until its allocation is filled, including after a
  // concurrent claimant wins a row. Every reservation still uses the SQL CAS.
  for (const phase of [oldest, ranked]) {
    for (const { queue, item, priority: score } of phase) {
      if (phase === oldest && claimed.length >= rotationSlots) break;
      if (claimedSlugs.has(item.slug)) continue;
      if (claimed.length >= cap) break;
      const basis = deriveComparisonBasis(item);
      if (!basis.eligible) continue;
      const expires = new Date(Date.parse(timestamp) + LOCK_MS).toISOString();
      const result = await run(db, `UPDATE price_update_queue SET status = 'RUNNING', priority = ?, attempts = attempts + 1, last_attempt_at = ?, lock_expires_at = ?, updated_at = ? WHERE product_slug = ? AND ((status IN ('PENDING','RETRY','DONE') AND (next_attempt_at IS NULL OR next_attempt_at <= ?)) OR (status = 'RUNNING' AND lock_expires_at <= ?))`, score, timestamp, expires, timestamp, item.slug, timestamp, timestamp);
      if ((result.meta?.changes ?? result.changes ?? 0) !== 1) continue;
      claimedSlugs.add(item.slug);
      const current = await first(db, `SELECT displayed_price, comparison_quantity, comparison_basis FROM coupang_price_current WHERE product_slug = ?`, item.slug);
      claimed.push({ slug: item.slug, name: item.name, brand: item.brand, spec: item.spec ?? null, quantity: basis.targetQuantity, comparisonQuantity:basis.comparisonQuantity, option: item.option ?? null, ...(Array.isArray(item.comparisonAliases)?{comparisonAliases:item.comparisonAliases}:{}), ...(typeof item.comparisonSearchQuery==='string'?{comparisonSearchQuery:item.comparisonSearchQuery}:{}), existingCoupangUrl: coupangUrl(item), previousPrice: current?.comparison_quantity === basis.comparisonQuantity && current.comparison_basis === comparisonBasisKey(item) ? current.displayed_price : null, referencePrice: Number.isSafeInteger(item.referencePrice) && item.referencePrice > 0 && Number.isSafeInteger(item.referencePrice*basis.comparisonQuantity) ? item.referencePrice*basis.comparisonQuantity : null });
    }
  }
  return claimed;
}

async function saveCurrent(db, observation, historyId, now) {
  if (!Number.isSafeInteger(observation.comparisonQuantity) || observation.comparisonQuantity <= 0) throw new Error('Verified comparison basis required');
  await run(db, `INSERT INTO coupang_price_current (product_slug, product_id, item_id, vendor_item_id, normalized_name, normalized_spec, normalized_quantity, displayed_price, comparison_quantity, comparison_basis, shipping_fee, seller, price_condition, source_url, match_score, checked_at, last_history_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(product_slug) DO UPDATE SET product_id=excluded.product_id, item_id=excluded.item_id, vendor_item_id=excluded.vendor_item_id, normalized_name=excluded.normalized_name, normalized_spec=excluded.normalized_spec, normalized_quantity=excluded.normalized_quantity, displayed_price=excluded.displayed_price, comparison_quantity=excluded.comparison_quantity, comparison_basis=excluded.comparison_basis, shipping_fee=excluded.shipping_fee, seller=excluded.seller, price_condition=excluded.price_condition, source_url=excluded.source_url, match_score=excluded.match_score, checked_at=excluded.checked_at, last_history_id=excluded.last_history_id WHERE excluded.checked_at >= coupang_price_current.checked_at AND (SELECT COALESCE(original_history_id, id) FROM price_history WHERE id = excluded.last_history_id) > (SELECT COALESCE(original_history_id, id) FROM price_history WHERE id = coupang_price_current.last_history_id)`, observation.slug ?? observation.productSlug, observation.productId ?? null, observation.itemId ?? null, observation.vendorItemId ?? null, observation.normalizedName ?? observation.title ?? '', observation.normalizedSpec ?? observation.spec ?? '', observation.normalizedQuantity ?? observation.quantity ?? '', observation.displayedPrice ?? observation.price, observation.comparisonQuantity, observation.comparisonBasis ?? null, observation.shippingFee ?? null, observation.seller ?? null, observation.priceCondition ?? null, observation.sourceUrl, observation.matchScore ?? 0, observation.observedAt ?? now, historyId);
}

function storedObservation(history) {
  return {
    slug: history.product_slug,
    productId: history.product_id,
    itemId: history.item_id,
    vendorItemId: history.vendor_item_id,
    sourceUrl: history.source_url,
    title: history.observed_title,
    spec: history.observed_spec,
    quantity: history.observed_quantity,
    displayedPrice: history.observed_price,
    comparisonQuantity: history.comparison_quantity,
    comparisonBasis: history.comparison_basis,
    shippingFee: history.shipping_fee,
    seller: history.seller,
    priceCondition: history.price_condition,
    matchScore: history.match_score,
    observedAt: history.observed_at,
  };
}

export async function recordObservation(db, observation, decision, now) {
  if (!observation.observationId) throw new Error('Observation ID is required');
  const timestamp = iso(now);
  await run(db, `INSERT OR IGNORE INTO price_history (product_slug, observation_id, product_id, item_id, vendor_item_id, entry_kind, attempted_at, observed_at, source_url, observed_title, observed_option, observed_spec, observed_quantity, observed_price, comparison_quantity, comparison_basis, search_card, shipping_fee, seller, price_condition, match_score, match_reasons, hard_mismatch, change_percent, status, reason, created_at) VALUES (?, ?, ?, ?, ?, 'OBSERVATION', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, observation.slug ?? observation.productSlug, observation.observationId, observation.productId ?? null, observation.itemId ?? null, observation.vendorItemId ?? null, timestamp, observation.observedAt ?? null, observation.sourceUrl ?? null, observation.title ?? null, observation.option ?? null, observation.spec ?? null, observation.quantity ?? null, observation.displayedPrice ?? observation.price ?? null, observation.comparisonQuantity ?? null, observation.comparisonBasis ?? null, json(observation.searchCard), observation.shippingFee ?? null, observation.seller ?? null, observation.priceCondition ?? null, observation.matchScore ?? null, json(observation.matchReasons), observation.hardMismatch ? 1 : 0, observation.changePercent ?? null, decision.status, decision.reason ?? null, timestamp);
  const history = await first(db, `SELECT * FROM price_history WHERE observation_id = ? AND entry_kind = 'OBSERVATION'`, observation.observationId);
  if (!history) throw new Error('Observation could not be stored');
  const review = await first(db, `SELECT * FROM price_history WHERE entry_kind = 'REVIEW_DECISION' AND original_history_id = ? ORDER BY id LIMIT 1`, history.id);
  if (review?.status === 'ACCEPT') await saveCurrent(db, storedObservation(review), review.id, timestamp);
  else if (!review && history.status === 'ACCEPT') await saveCurrent(db, storedObservation(history), history.id, timestamp);
  const effectiveStatus = review?.status ?? history.status;
  const status = effectiveStatus === 'REVIEW' || effectiveStatus === 'REVERIFY' ? 'REVIEW' : effectiveStatus === 'BLOCKED' ? 'RETRY' : effectiveStatus === 'RETRY' ? 'RETRY' : 'DONE';
  const queue = await first(db, 'SELECT attempts FROM price_update_queue WHERE product_slug = ?', history.product_slug);
  const nextAttempt = status === 'RETRY' ? new Date(Date.parse(history.attempted_at) + Math.min(86400000, 300000 * 2 ** Math.min(9, Math.max(0, (queue?.attempts ?? 1)-1)))).toISOString() : null;
  await run(db, `UPDATE price_update_queue SET status = ?, lock_expires_at = NULL, next_attempt_at = ?, last_checked_at = ?, updated_at = ? WHERE product_slug = ? AND (last_checked_at IS NULL OR last_checked_at <= ?)`, status, nextAttempt, timestamp, timestamp, history.product_slug, history.attempted_at);
}

export async function listCurrentPrices(db, slugs) {
  if (!slugs?.length) return [];
  const unique = [...new Set(slugs)];
  const found = [];
  for (let offset=0; offset<unique.length; offset+=100) {
    const chunk=unique.slice(offset,offset+100);
    found.push(...await rows(db, `SELECT product_slug AS slug, product_id AS productId, item_id AS itemId, vendor_item_id AS vendorItemId, normalized_name AS normalizedName, normalized_spec AS normalizedSpec, normalized_quantity AS normalizedQuantity, comparison_basis AS comparisonBasisKey, displayed_price AS displayedPrice, comparison_quantity AS comparisonQuantity, shipping_fee AS shippingFee, seller, price_condition AS priceCondition, source_url AS sourceUrl, match_score AS matchScore, checked_at AS checkedAt, last_history_id AS lastHistoryId FROM coupang_price_current WHERE comparison_quantity IS NOT NULL AND product_slug IN (${chunk.map(() => '?').join(',')})`, ...chunk));
  }
  const order = new Map(unique.map((slug,index)=>[slug,index]));
  found.sort((a,b)=>order.get(a.slug)-order.get(b.slug));
  return found.map(row=>({...row,comparisonUnitPrice:comparisonUnitPrice(row.displayedPrice,row.comparisonQuantity)})).filter(row=>row.comparisonUnitPrice!==null);
}

export async function reviewObservation(db, { historyId, action, reviewer, now }) {
  if (!['ACCEPT', 'REJECT', 'RETRY'].includes(action)) throw new Error('Invalid review action');
  const original = await first(db, `SELECT * FROM price_history WHERE id = ? AND entry_kind = 'OBSERVATION'`, historyId);
  if (!original) throw new Error('Observation not found');
  if (action === 'ACCEPT' && (!(original.observed_price > 0) || !Number.isSafeInteger(original.comparison_quantity) || original.comparison_quantity <= 0 || original.hard_mismatch || original.match_score < 95)) throw new Error('Unverified observations cannot be accepted');
  const timestamp = iso(now);
  await run(db, `INSERT INTO price_history (product_slug, product_id, item_id, vendor_item_id, entry_kind, original_history_id, attempted_at, observed_at, source_url, observed_title, observed_option, observed_spec, observed_quantity, observed_price, comparison_quantity, comparison_basis, search_card, shipping_fee, seller, price_condition, match_score, match_reasons, hard_mismatch, change_percent, status, reason, reviewer, reviewed_at, created_at) SELECT ?, ?, ?, ?, 'REVIEW_DECISION', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM price_history WHERE entry_kind = 'REVIEW_DECISION' AND original_history_id = ?)`, original.product_slug, original.product_id, original.item_id, original.vendor_item_id, historyId, original.attempted_at, original.observed_at, original.source_url, original.observed_title, original.observed_option, original.observed_spec, original.observed_quantity, original.observed_price, original.comparison_quantity, original.comparison_basis, original.search_card, original.shipping_fee, original.seller, original.price_condition, original.match_score, original.match_reasons, original.hard_mismatch, original.change_percent, action, 'MANUAL_REVIEW', reviewer, timestamp, timestamp, historyId);
  const decision = await first(db, `SELECT * FROM price_history WHERE entry_kind = 'REVIEW_DECISION' AND original_history_id = ? ORDER BY id LIMIT 1`, historyId);
  if (!decision) throw new Error('Review decision could not be stored');
  if (decision.status !== action) throw new Error('Observation already reviewed with a different action');
  if (decision.status === 'ACCEPT') await saveCurrent(db, storedObservation(decision), decision.id, timestamp);
  await run(db, `UPDATE price_update_queue SET status = ?, lock_expires_at = NULL, next_attempt_at = ?, updated_at = ? WHERE product_slug = ? AND (last_checked_at IS NULL OR last_checked_at <= ?)`, action === 'RETRY' ? 'RETRY' : 'DONE', action === 'RETRY' ? timestamp : null, timestamp, original.product_slug, original.attempted_at);
}

export async function listAllCurrentPrices(db){return (await rows(db,`SELECT product_slug AS slug, product_id AS productId, item_id AS itemId, vendor_item_id AS vendorItemId, normalized_name AS normalizedName, normalized_spec AS normalizedSpec, normalized_quantity AS normalizedQuantity, comparison_basis AS comparisonBasisKey, displayed_price AS displayedPrice, comparison_quantity AS comparisonQuantity, shipping_fee AS shippingFee, seller, price_condition AS priceCondition, source_url AS sourceUrl, match_score AS matchScore, checked_at AS checkedAt, last_history_id AS lastHistoryId FROM coupang_price_current WHERE comparison_quantity IS NOT NULL`)).map(row=>({...row,comparisonUnitPrice:comparisonUnitPrice(row.displayedPrice,row.comparisonQuantity)})).filter(row=>row.comparisonUnitPrice!==null);}
