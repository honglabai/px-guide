import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { seedPriceQueue, claimPriceBatch, recordObservation, listCurrentPrices, reviewObservation } from '../price/store.mjs';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  const migration = readFileSync(new URL('../drizzle/0001_moaning_true_believers.sql', import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', '');
  sqlite.exec(migration);
  sqlite.exec(readFileSync(new URL('../drizzle/0002_gorgeous_the_executioner.sql', import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', ''));
  sqlite.exec(readFileSync(new URL('../drizzle/0003_verified_bundle_basis.sql', import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', ''));
  sqlite.exec(readFileSync(new URL('../drizzle/0004_verified_offer_evidence.sql', import.meta.url), 'utf8').replaceAll('--> statement-breakpoint', ''));
  const db = {
    sqlite,
    failCurrentOnce: false,
    readCalls: 0,
    prepare(sql) {
      return { bind(...args) { if (args.length > 100) throw new Error('D1 bind limit exceeded'); const stmt = sqlite.prepare(sql); return {
        run: async () => {
          if (db.failCurrentOnce && sql.startsWith('INSERT INTO coupang_price_current')) {
            db.failCurrentOnce = false;
            throw new Error('injected current write failure');
          }
          return stmt.run(...args);
        },
        first: async () => { db.readCalls++; return stmt.get(...args) ?? null; },
        all: async () => { db.readCalls++; return { results: stmt.all(...args) }; },
      }; } };
    },
  };
  return db;
}
const catalog = Array.from({ length: 25 }, (_, i) => ({ slug: `item-${i}`, name: `상품 ${i}`, brand: '브랜드', spec: '100ml', comparisonKind:'sameBundle', comparisonQuantity: i === 0 ? 20 : 1, productUrl: i === 0 ? 'https://www.coupang.com/vp/products/1' : 'https://notcoupang.com/item', officialPrice: 9999, referencePrice: 1000 }));
const now = '2026-10-15T00:00:00.000Z';

 test('overlapping seeds create one queue row per slug without seeding current prices', async () => {
  const db = database();
  await seedPriceQueue(db, catalog, 0, 20);
  await seedPriceQueue(db, catalog, 10, 15);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM price_update_queue').get().n, 25);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM coupang_price_current').get().n, 0);
});

test('simultaneous claims reserve each slug once and cap batches at 20', async () => {
  const db = database();
  await seedPriceQueue(db, catalog, 0, 25);
  const [first, second] = await Promise.all([claimPriceBatch(db, catalog, now, 20), claimPriceBatch(db, catalog, now, 20)]);
  assert.ok(first.length <= 20);
  assert.ok(second.length <= 20);
  assert.equal(first.length + second.length, 25);
  assert.equal(new Set([...first, ...second].map(item => item.slug)).size, 25);
  const all = [...first, ...second];
  assert.equal(all.find(item => item.slug === 'item-0').existingCoupangUrl, 'https://www.coupang.com/vp/products/1');
  assert.equal(all.find(item => item.slug === 'item-1').existingCoupangUrl, null);
  assert.equal(all[0].previousPrice, null);
  assert.equal(all.find(item=>item.slug==='item-0').referencePrice,20000);
  assert.equal(all.find(item=>item.slug==='item-0').quantity,'20개');
  assert.equal(all.find(item=>item.slug==='item-0').comparisonQuantity,20);
});

test('expired RUNNING lock is claimable again', async () => {
  const db = database();
  await seedPriceQueue(db, catalog, 0, 1);
  const first = await claimPriceBatch(db, catalog, now, 1);
  assert.equal((await claimPriceBatch(db, catalog, now, 1)).length, 0);
  const later = '2026-10-15T01:00:00.000Z';
  const reclaimed = await claimPriceBatch(db, catalog, later, 1);
  assert.equal(reclaimed[0].slug, first[0].slug);
  assert.equal(db.sqlite.prepare('SELECT attempts FROM price_update_queue WHERE product_slug = ?').get(first[0].slug).attempts, 2);
});

const observation = { observationId: 'obs-1', slug: 'item-0', sourceUrl: 'https://www.coupang.com/vp/products/1', observedAt: now, title: '상품', option: '기본', spec: '100ml', quantity: '20개', comparisonQuantity:20, displayedPrice: 1200, shippingFee: 0, seller: '쿠팡', priceCondition: '일반가', matchScore: 100, matchReasons: [], hardMismatch: false };

test('duplicate observation ID cannot create duplicate history or current rows', async () => {
  const db = database();
  await seedPriceQueue(db, catalog, 0, 1);
  await Promise.all([recordObservation(db, observation, { status: 'ACCEPT', reason: 'VERIFIED' }, now), recordObservation(db, observation, { status: 'ACCEPT', reason: 'VERIFIED' }, now)]);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM price_history').get().n, 1);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM coupang_price_current').get().n, 1);
  await recordObservation(db, { ...observation, displayedPrice: 9999 }, { status: 'ACCEPT', reason: 'REPLAY' }, now);
  assert.equal((await listCurrentPrices(db, ['item-0']))[0].displayedPrice, 1200);
  assert.equal((await listCurrentPrices(db, ['item-0']))[0].comparisonQuantity,20);
  assert.equal((await listCurrentPrices(db, ['item-0']))[0].comparisonUnitPrice,60);
  assert.equal(db.sqlite.prepare('SELECT comparison_quantity FROM price_history').get().comparison_quantity,20);
});

test('review appends a decision row and preserves the original observation', async () => {
  const db = database();
  await recordObservation(db, observation, { status: 'REVIEW', reason: 'PRICE_JUMP' }, now);
  const original = db.sqlite.prepare('SELECT * FROM price_history').get();
  await reviewObservation(db, { historyId: original.id, action: 'ACCEPT', reviewer: 'owner', now: '2026-10-16T00:00:00.000Z' });
  const rows = db.sqlite.prepare('SELECT * FROM price_history ORDER BY id').all();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, 'REVIEW');
  assert.equal(rows[1].entry_kind, 'REVIEW_DECISION');
  assert.equal(rows[1].original_history_id, original.id);
  assert.equal(rows[1].reviewer, 'owner');
  assert.equal((await listCurrentPrices(db, ['item-0']))[0].lastHistoryId, rows[1].id);
});

 test('build emits source-backed catalog with all products and no inferred count', async () => {
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, ['build.mjs']);
  const emitted = JSON.parse(readFileSync(new URL('../dist/client/price-catalog.json', import.meta.url), 'utf8'));
  const source = JSON.parse(readFileSync(new URL('../content/products.json', import.meta.url), 'utf8'));
  assert.equal(emitted.length, source.length);
  assert.deepEqual(emitted[0].quantity, source[0].quantity ?? null);
  assert.equal(emitted[0].officialPrice, undefined);
  assert.equal(emitted[0].referencePrice, Number.isSafeInteger(source[0].officialPrice) && source[0].officialPrice > 0 ? source[0].officialPrice : null);
  assert.equal(emitted[0].comparisonKind,source[0].comparisonKind);
  assert.equal(emitted[0].comparisonQuantity,source[0].comparisonQuantity??null);
  const samdasu=emitted.find(item=>item.slug==='samdasu-green-500x20');
  assert.deepEqual(samdasu.comparisonAliases,['제주삼다수 그린','제주삼다수','삼다수']);
  assert.equal(samdasu.comparisonSearchQuery,'삼다수 500ml 20병');
  assert.doesNotMatch(readFileSync(new URL('../dist/server/index.js', import.meta.url), 'utf8'), /(?:from\s*|import\s*\()['"]\.\.?\//, 'deployed Worker must contain its local modules');
  assert.equal(typeof (await import('../dist/server/index.js')).default.fetch, 'function');
});

test('claimed batch carries optional verified aliases and search query from catalog',async()=>{
 const db=database();const product={...catalog[0],comparisonAliases:['믹스쿠키'],comparisonSearchQuery:'믹스쿠키 100ml 20개'};
 await seedPriceQueue(db,[product],0,1);
 const [claimed]=await claimPriceBatch(db,[product],now,1);
 assert.deepEqual(claimed.comparisonAliases,['믹스쿠키']);
 assert.equal(claimed.comparisonSearchQuery,'믹스쿠키 100ml 20개');
});

 test('observation accepts productSlug identity and stores accepted current price', async () => {
  const db = database();
  await recordObservation(db, { ...observation, slug: undefined, productSlug: 'item-0', observationId: 'obs-alt' }, { status: 'ACCEPT', reason: 'VERIFIED' }, now);
  assert.equal((await listCurrentPrices(db, ['item-0']))[0].displayedPrice, 1200);
});


test('accepted observation replay repairs a failed current projection without another history row', async () => {
  const db = database();
  db.failCurrentOnce = true;
  await assert.rejects(recordObservation(db, observation, { status: 'ACCEPT', reason: 'VERIFIED' }, now), /injected current write failure/);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM price_history').get().n, 1);
  assert.equal((await listCurrentPrices(db, ['item-0'])).length, 0);
  await recordObservation(db, { ...observation, displayedPrice: 9999 }, { status: 'REJECT', reason: 'REPLAY_TAMPER' }, now);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM price_history').get().n, 1);
  assert.equal((await listCurrentPrices(db, ['item-0']))[0].displayedPrice, 1200);
});

test('older accepted replay cannot replace a newer accepted price', async () => {
  const db = database();
  db.failCurrentOnce = true;
  await assert.rejects(recordObservation(db, observation, { status: 'ACCEPT', reason: 'VERIFIED' }, now), /injected current write failure/);
  await recordObservation(db, { ...observation, observationId: 'obs-2', displayedPrice: 1500 }, { status: 'ACCEPT', reason: 'VERIFIED' }, now);
  await recordObservation(db, observation, { status: 'ACCEPT', reason: 'VERIFIED' }, now);
  assert.equal((await listCurrentPrices(db, ['item-0']))[0].displayedPrice, 1500);
});

test('review replay repairs a failed projection without appending a second decision', async () => {
  const db = database();
  await recordObservation(db, observation, { status: 'REVIEW', reason: 'PRICE_JUMP' }, now);
  const original = db.sqlite.prepare('SELECT id FROM price_history').get();
  const review = { historyId: original.id, action: 'ACCEPT', reviewer: 'owner', now: '2026-10-16T00:00:00.000Z' };
  db.failCurrentOnce = true;
  await assert.rejects(reviewObservation(db, review), /injected current write failure/);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM price_history').get().n, 2);
  assert.equal((await listCurrentPrices(db, ['item-0'])).length, 0);
  await reviewObservation(db, review);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM price_history').get().n, 2);
  assert.equal((await listCurrentPrices(db, ['item-0']))[0].displayedPrice, 1200);
});


test('older review replay does not replace a newer accepted observation', async () => {
  const db = database();
  await recordObservation(db, observation, { status: 'REVIEW', reason: 'PRICE_JUMP' }, now);
  const original = db.sqlite.prepare('SELECT id FROM price_history').get();
  const review = { historyId: original.id, action: 'ACCEPT', reviewer: 'owner', now: '2026-10-16T00:00:00.000Z' };
  db.failCurrentOnce = true;
  await assert.rejects(reviewObservation(db, review), /injected current write failure/);
  await recordObservation(db, { ...observation, observationId: 'obs-new', displayedPrice: 1500 }, { status: 'ACCEPT', reason: 'VERIFIED' }, '2026-10-17T00:00:00.000Z');
  await reviewObservation(db, review);
  assert.equal((await listCurrentPrices(db, ['item-0']))[0].displayedPrice, 1500);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM price_history').get().n, 3);
  await assert.rejects(reviewObservation(db, { ...review, action: 'REJECT' }), /different action/);
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM price_history').get().n, 3);
});

test('late approval of an older observation cannot replace a newer accepted current price', async () => {
  const db = database();
  await recordObservation(db, observation, { status: 'REVIEW', reason: 'PRICE_JUMP' }, now);
  const original = db.sqlite.prepare('SELECT id FROM price_history').get();
  await recordObservation(db, { ...observation, observationId: 'obs-new-direct', displayedPrice: 1500, observedAt: '2026-10-17T00:00:00.000Z' }, { status: 'ACCEPT', reason: 'VERIFIED' }, '2026-10-17T00:00:00.000Z');
  await reviewObservation(db, { historyId: original.id, action: 'ACCEPT', reviewer: 'owner', now: '2026-10-18T00:00:00.000Z' });
  const current = (await listCurrentPrices(db, ['item-0']))[0];
  assert.equal(current.displayedPrice, 1500);
  assert.equal(current.checkedAt, '2026-10-17T00:00:00.000Z');
});

test('late older observation cannot replace a newer checkedAt price', async () => {
  const db = database();
  await recordObservation(db, { ...observation, observationId: 'new-first', observedAt: '2026-10-17T00:00:00.000Z', displayedPrice: 1500 }, { status: 'ACCEPT', reason: 'VERIFIED' }, '2026-10-17T00:00:00.000Z');
  await recordObservation(db, { ...observation, observationId: 'old-late', observedAt: '2026-10-15T00:00:00.000Z', displayedPrice: 1200 }, { status: 'ACCEPT', reason: 'VERIFIED' }, '2026-10-18T00:00:00.000Z');
  const current = (await listCurrentPrices(db, ['item-0']))[0];
  assert.equal(current.displayedPrice, 1500);
  assert.equal(current.checkedAt, '2026-10-17T00:00:00.000Z');
});

test('observation replay does not reopen a completed review', async () => {
  const db = database();
  await seedPriceQueue(db, catalog, 0, 1);
  await recordObservation(db, observation, { status: 'REVIEW', reason: 'PRICE_JUMP' }, now);
  const original = db.sqlite.prepare('SELECT id FROM price_history').get();
  await reviewObservation(db, { historyId: original.id, action: 'ACCEPT', reviewer: 'owner', now: '2026-10-16T00:00:00.000Z' });
  await recordObservation(db, observation, { status: 'REVIEW', reason: 'PRICE_JUMP' }, now);
  assert.equal(db.sqlite.prepare('SELECT status FROM price_update_queue WHERE product_slug = ?').get('item-0').status, 'DONE');
});


test('large ready queue ranks with bounded reads and still returns at most twenty', async () => {
  const db = database();
  const largeCatalog = Array.from({ length: 2278 }, (_, i) => ({ slug: `large-${i}`, name: `상품 ${i}`, brand: '브랜드', spec: '100ml', comparisonKind:'sameBundle',comparisonQuantity:1 }));
  const insert = db.sqlite.prepare("INSERT INTO price_update_queue (product_slug, status, created_at, updated_at) VALUES (?, 'PENDING', ?, ?)");
  for (const item of largeCatalog) insert.run(item.slug, now, now);
  db.sqlite.prepare('INSERT INTO product_interest_daily (day, product_slug, favorite_adds, shopping_adds) VALUES (?, ?, ?, ?)').run('2026-10-14', 'large-2277', 40, 0);
  db.readCalls = 0;
  const batch = await claimPriceBatch(db, largeCatalog, now);
  assert.equal(batch.length, 20);
  assert.equal(batch[0].slug, 'large-2277');
  assert.ok(db.readCalls <= 25, `claim used ${db.readCalls} reads`);
});

test('accepted observation persists Coupang identity on first projection', async () => {
  const db = database();
  await recordObservation(db, { ...observation, productId: 'p-1', itemId: 'i-2', vendorItemId: 'v-3' }, { status: 'ACCEPT', reason: 'VERIFIED' }, now);
  const current = (await listCurrentPrices(db, ['item-0']))[0];
  assert.deepEqual([current.productId, current.itemId, current.vendorItemId], ['p-1', 'i-2', 'v-3']);
});

test('crash replay restores persisted Coupang IDs from immutable history', async () => {
  const db = database();
  db.failCurrentOnce = true;
  await assert.rejects(recordObservation(db, { ...observation, productId: 'p-1', itemId: 'i-2', vendorItemId: 'v-3' }, { status: 'ACCEPT', reason: 'VERIFIED' }, now), /injected current write failure/);
  await recordObservation(db, { ...observation, productId: 'tampered' }, { status: 'REJECT', reason: 'REPLAY' }, now);
  const current = (await listCurrentPrices(db, ['item-0']))[0];
  assert.deepEqual([current.productId, current.itemId, current.vendorItemId], ['p-1', 'i-2', 'v-3']);
});


test('current reads chunk more than 100 unique slugs and preserve requested order and filtering', async () => {
  const db = database();
  const slugs = Array.from({length:205}, (_, i)=>`chunk-${i}`);
  for (const slug of slugs) await recordObservation(db,{...observation,slug,observationId:slug},{status:'ACCEPT'},now);
  db.sqlite.prepare("UPDATE coupang_price_current SET comparison_quantity=NULL WHERE product_slug='chunk-100'").run();
  const requested=[...slugs.reverse(),slugs[0],'missing'];
  const result=await listCurrentPrices(db,requested);
  assert.deepEqual(result.map(row=>row.slug),slugs.filter(slug=>slug!=='chunk-100'));
});

test('overdue ordinary backlog rotates despite more than twenty popular discounted products', async () => {
  const db=database();
  const products=Array.from({length:30},(_,i)=>({...catalog[1],slug:`popular-${i}`,monthlyDiscount:true,discountMonth:'2026-10'}));
  products.push({...catalog[1],slug:'ordinary-a'},{...catalog[1],slug:'ordinary-b'});
  await seedPriceQueue(db,products);
  db.sqlite.prepare("UPDATE price_update_queue SET created_at='2026-08-01T00:00:00.000Z'").run();
  for(const item of products.slice(0,30)) db.sqlite.prepare('INSERT INTO product_interest_daily (day,product_slug,favorite_adds,shopping_adds) VALUES (?,?,40,0)').run('2026-10-14',item.slug);
  const seen=new Set();
  for(let i=0;i<4;i++) {
    const batch=await claimPriceBatch(db,products,now,20);
    assert.ok(batch.length<=20);
    for(const item of batch) { seen.add(item.slug); await recordObservation(db,{...observation,slug:item.slug,observationId:`rotation-${i}-${item.slug}`},{status:'ACCEPT'},now); }
  }
  assert.ok(seen.has('ordinary-a') && seen.has('ordinary-b'));
});


test('each batch reserves eighty percent for oldest work with proportional small limits',async()=>{
 for(const limit of [20,5,1]) {
  const db=database();
  const popular=Array.from({length:25},(_,i)=>({...catalog[1],slug:`popular-${i}`,monthlyDiscount:true,discountMonth:'2026-10'}));
  const ordinary=Array.from({length:25},(_,i)=>({...catalog[1],slug:`ordinary-${i}`}));
  await seedPriceQueue(db,[...popular,...ordinary]);
  db.sqlite.prepare("UPDATE price_update_queue SET created_at='2026-10-14T00:00:00.000Z'").run();
  db.sqlite.prepare("UPDATE price_update_queue SET created_at='2026-10-01T00:00:00.000Z' WHERE product_slug LIKE 'ordinary-%'").run();
  const batch=await claimPriceBatch(db,[...popular,...ordinary],now,limit);
  assert.equal(batch.length,limit);
  assert.ok(batch.filter(row=>row.slug.startsWith('ordinary-')).length>=Math.ceil(limit*0.8));
  if(limit>1) assert.ok(batch.some(row=>row.slug.startsWith('popular-')));
 }
});
