import { listCurrentPrices, listAllCurrentPrices, reviewObservation } from './store.mjs';
import { deriveComparisonBasis, validateObservedQuantity, comparisonBasisKey, ordinaryPriceCondition } from './comparison-basis.mjs';

export const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
export class InputError extends Error {}
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const validSlug = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 160;
export const isOwner = (request, env) => typeof env.PRICE_ADMIN_EMAIL === 'string' && Boolean(env.PRICE_ADMIN_EMAIL.trim()) && request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase() === env.PRICE_ADMIN_EMAIL.trim().toLowerCase();
export const safeOrigin = request => request.headers.get('sec-fetch-site') !== 'cross-site' && (!request.headers.get('origin') || request.headers.get('origin') === new URL(request.url).origin);
export async function readJson(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new InputError('Expected application/json');
  const reader = request.body?.getReader();
  if (!reader) throw new InputError('JSON body required');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 131072) { await reader.cancel(); throw new InputError('Body too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new InputError('Invalid JSON'); }
}
export async function loadCatalog(request, env) {
  const response = await env.ASSETS.fetch(new Request(new URL('/price-catalog.json', request.url)));
  if (!response.ok) throw new Error('Catalog unavailable');
  const catalog = await response.json();
  if (!Array.isArray(catalog)) throw new Error('Invalid catalog');
  return catalog;
}
async function verifiedCurrent(request, env, slugs) {
  const [catalog, current] = await Promise.all([loadCatalog(request, env), slugs===null?listAllCurrentPrices(env.DB):listCurrentPrices(env.DB, slugs)]);
  const products = new Map(catalog.map(item => [item.slug, item]));
  return current.filter(row => {
    const product = products.get(row.slug), basis = deriveComparisonBasis(product);
    return basis.eligible && row.comparisonQuantity === basis.comparisonQuantity && row.comparisonBasisKey === comparisonBasisKey(product);
  });
}
export function validateReview(value) {
  if (!object(value) || !Number.isSafeInteger(value.historyId) || value.historyId <= 0 || !['ACCEPT','REJECT','RETRY'].includes(value.action)) throw new InputError('Invalid review');
  return {historyId:value.historyId, action:value.action};
}
export async function performReview(request, env, value) {
  const review = validateReview(value);
  const original = await env.DB.prepare("SELECT * FROM price_history WHERE id = ? AND entry_kind = 'OBSERVATION'").bind(review.historyId).first();
  if (!original) throw new InputError('Observation not found');
  if (review.action === 'ACCEPT' && (!Number.isSafeInteger(original.observed_price) || original.observed_price <= 0 || !validCoupangUrl(original.source_url))) throw new InputError('Observation has no valid price or source');
  if (review.action === 'ACCEPT') {
    const catalog=await loadCatalog(request,env);
    const basis=deriveComparisonBasis(catalog.find(item=>item.slug===original.product_slug));
    const quantity=validateObservedQuantity(basis,{title:original.observed_title,quantity:original.observed_quantity,option:original.observed_option});
    const basisKey=comparisonBasisKey(catalog.find(item=>item.slug===original.product_slug));
    // Approval targets the freshly verified catalog basis; the preserved prior
    // current may use an older basis and is replaced only by this owner action.
    if (!basis.eligible || !quantity.valid || original.comparison_quantity !== basis.comparisonQuantity || original.comparison_basis !== basisKey || !original.search_card || !ordinaryPriceCondition(original.price_condition) || original.hard_mismatch || original.match_score < 95) throw new InputError('Observation has no verified comparison basis');
  }
  const prior = await env.DB.prepare("SELECT status FROM price_history WHERE original_history_id = ? AND entry_kind = 'REVIEW_DECISION' LIMIT 1").bind(review.historyId).first();
  if (prior && prior.status !== review.action) throw new InputError('Observation already reviewed');
  await reviewObservation(env.DB, {...review, reviewer:request.headers.get('oai-authenticated-user-email'), now:new Date()});
  return {reviewed:true};
}
export function validCoupangUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && (url.hostname === 'coupang.com' || url.hostname.endsWith('.coupang.com')); } catch { return false; }
}
export async function handlePriceHttp(request, env) {
  const url = new URL(request.url);
  const methods = {'/api/prices/index':'GET','/api/prices':'GET','/api/admin/prices':'GET','/api/admin/prices/review':'POST','/api/interest':'POST'};
  const method = methods[url.pathname];
  if (!method) return null;
  if (url.pathname.startsWith('/api/admin/') && !isOwner(request,env)) return json({error:'Forbidden'},403);
  if (request.method !== method) return json({error:'Method not allowed'},405,{Allow:method});
  if (method === 'POST' && !safeOrigin(request)) return json({error:'Forbidden'},403);
  try {
    if(url.pathname==='/api/prices/index')return json({prices:await verifiedCurrent(request,env,null)});
    if (url.pathname === '/api/prices') {
      const slugs = (url.searchParams.get('slugs') ?? '').split(',');
      if (slugs.length > 100 || !slugs.every(validSlug)) throw new InputError('Provide 1–100 valid slugs');
      return json({prices:await verifiedCurrent(request,env,[...new Set(slugs)])});
    }
    if (url.pathname === '/api/admin/prices') {
      const offsetText = url.searchParams.get('pendingOffset') ?? '0';
      const pendingOffset = Number(offsetText);
      if (!/^(0|[1-9]\d*)$/.test(offsetText) || !Number.isSafeInteger(pendingOffset) || pendingOffset > 1000000) throw new InputError('Invalid pending offset');
      const pendingLimit = 100;
      const queue = await env.DB.prepare('SELECT * FROM price_update_queue ORDER BY updated_at DESC LIMIT 100').bind().all();
      const history = await env.DB.prepare('SELECT * FROM price_history ORDER BY id DESC LIMIT 100').bind().all();
      const pendingWhere = "FROM price_history h WHERE h.entry_kind = 'OBSERVATION' AND h.status IN ('REVIEW','REVERIFY') AND NOT EXISTS (SELECT 1 FROM price_history d WHERE d.entry_kind = 'REVIEW_DECISION' AND d.original_history_id = h.id)";
      const pendingTotal = Number((await env.DB.prepare(`SELECT COUNT(*) AS total ${pendingWhere}`).bind().first())?.total ?? 0);
      const pending = await env.DB.prepare(`SELECT h.* ${pendingWhere} ORDER BY h.id DESC LIMIT ? OFFSET ?`).bind(pendingLimit,pendingOffset).all();
      const slugs = [...new Set([...pending.results,...history.results].map(row => row.product_slug))];
      const current = slugs.length ? await listCurrentPrices(env.DB,slugs) : [];
      return json({queue:queue.results,history:history.results,pending:pending.results,pendingTotal,pendingOffset,pendingLimit,current});
    }
    const body = await readJson(request);
    if (url.pathname === '/api/admin/prices/review') return json(await performReview(request,env,body));
    if (!object(body) || Object.keys(body).length !== 2 || !Object.keys(body).every(key => ['slug','kind'].includes(key)) || !validSlug(body.slug) || !['favorite','shopping'].includes(body.kind)) throw new InputError('Invalid interest event');
    const catalog = await loadCatalog(request,env);
    if (!catalog.some(item => item.slug === body.slug)) throw new InputError('Unknown slug');
    const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const favorite = body.kind === 'favorite' ? 1 : 0;
    const shopping = body.kind === 'shopping' ? 1 : 0;
    await env.DB.prepare('INSERT INTO product_interest_daily (day, product_slug, favorite_adds, shopping_adds) VALUES (?, ?, ?, ?) ON CONFLICT(day, product_slug) DO UPDATE SET favorite_adds = favorite_adds + excluded.favorite_adds, shopping_adds = shopping_adds + excluded.shopping_adds').bind(day, body.slug, favorite, shopping).run();
    return json({recorded:true});
  } catch (error) {
    return json({error:error instanceof InputError ? error.message : 'Price service unavailable'},error instanceof InputError ? 400 : 503);
  }
}
