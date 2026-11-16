import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchCandidate, decidePrice } from '../price/rules.mjs';

const biscuit = { name: '로투스 비스코프', brand: '로투스', spec: '125g', quantity: '1개', option: '오리지널' };

test('an exact 125g single item scores at least 95', () => {
  const match = matchCandidate(biscuit, { ...biscuit });
  assert.ok(match.score >= 95);
  assert.equal(match.hardMismatch, false);
});

test('a descriptive listing title retains the core product name match', () => {
  const match = matchCandidate(biscuit, { ...biscuit, name: '로투스 비스코프 오리지널 125g 1개' });
  assert.ok(match.score >= 95);
});

test('a catalog name containing its size matches a listing with extra option words', () => {
  const match = matchCandidate({ ...biscuit, name: '로투스 비스코프 125g' }, { ...biscuit, name: '로투스 비스코프 오리지널 125g 1개' });
  assert.ok(match.score >= 95);
});

test('a six pack cannot match a single 400ml item', () => {
  const product = { ...biscuit, spec: '400ml', quantity: '6개' };
  const candidate = { ...product, quantity: '1개' };
  const match = matchCandidate(product, candidate);
  assert.equal(match.hardMismatch, true);
  assert.equal(decidePrice({ match, observedPrice: 1000, previousPrice: 1000, reverified: true }).status, 'REJECT');
});

test('real catalog shape uses the explicit pack count in its name', () => {
  const products = JSON.parse(readFileSync(new URL('../content/products.json', import.meta.url), 'utf8'));
  const product = products.find((item) => item.slug === 'samdasu-green-500x20');
  assert.equal(product.quantity, undefined);
  const match = matchCandidate(product, { name: product.name, brand: product.brand, spec: '500ml', quantity: '20병' });
  assert.equal(match.score, 100);
  assert.equal(match.hardMismatch, false);
});

test('verified aliases accept exact title cores without trusting a supplied brand', () => {
  const product = {name:'제주삼다수 그린 500ml×20병',brand:'광동제약',spec:'500ml',quantity:'20병',comparisonAliases:['제주삼다수 그린','제주삼다수','삼다수']};
  for (const title of ['제주삼다수 500ml 20병','삼다수 500ml 20병']) {
    const match = matchCandidate(product,{name:title,brand:'다른 회사'});
    assert.equal(match.score,100,title);
    assert.equal(match.hardMismatch,false,title);
  }
  for (const title of ['삼다수 레몬 500ml 20병','제주삼다수 무라벨 500ml 20병','다른 생수 500ml 20병']) {
    assert.ok(matchCandidate(product,{name:title,brand:'광동제약'}).score<95,title);
  }
  assert.ok(matchCandidate({...product,comparisonAliases:undefined},{name:'삼다수 500ml 20병',brand:'광동제약'}).score<95);
});
test('adding one alias retains the exact original catalog name without admitting new variants',()=>{
  const product={name:'제조사 믹스 125g',brand:'제조사',spec:'125g',quantity:'20개',comparisonAliases:['믹스쿠키']};
  const original=matchCandidate(product,{name:'제조사 믹스 125g 20개',brand:'잘못된 제출 브랜드'});
  assert.equal(original.score,100);
  assert.equal(original.matchedAlias,undefined);
  assert.equal(matchCandidate(product,{name:'믹스쿠키 125g 20개',brand:'잘못된 제출 브랜드'}).score,100);
  for(const title of ['믹스쿠키 초코 125g 20개','제조사 믹스 초코 125g 20개'])assert.ok(matchCandidate(product,{name:title,brand:'제조사'}).score<95,title);
});
test('Samdasu original Green title remains valid even if only shortened aliases are configured',()=>{
 const product={name:'제주삼다수 그린 500ml×20병',brand:'광동제약',spec:'500ml',quantity:'20병',comparisonAliases:['제주삼다수','삼다수']};
 assert.equal(matchCandidate(product,{name:'제주삼다수 그린 500ml 20병',brand:'광동제약'}).score,85);
 assert.equal(matchCandidate({...product,comparisonAliases:['제주삼다수 그린',...product.comparisonAliases]},{name:'제주삼다수 그린 500ml 20병',brand:'다른 회사'}).score,100);
 assert.ok(matchCandidate(product,{name:'제주삼다수 그린 무라벨 500ml 20병',brand:'광동제약'}).score<95);
});
test('original name with configured alias needs brand visible in title, not submitted brand',()=>{
 const product={name:'믹스 125g',brand:'제조사',spec:'125g',quantity:'20개',comparisonAliases:['믹스쿠키']};
 const absent=matchCandidate(product,{name:'믹스 125g 20개',brand:'제조사'});
 assert.equal(absent.score,85);assert.equal(absent.matchedAlias,undefined);
 assert.equal(matchCandidate(product,{name:'제조사 믹스 125g 20개',brand:'다른 회사'}).score,100);
 assert.ok(matchCandidate(product,{name:'제조사 믹스 초코 125g 20개',brand:'제조사'}).score<95);
});
test('visible catalog brand can differ from title spacing without trusting supplied brand',()=>{
 const product={name:'AB 믹스 125g',brand:'A B',spec:'125g',quantity:'20개',comparisonAliases:['믹스쿠키']};
 const match=matchCandidate(product,{name:'AB 믹스 125g 20개',brand:'다른 회사'});
 assert.equal(match.score,100);assert.equal(match.matchedBrand,'A B');
 assert.equal(match.matchedAlias,undefined);
 assert.ok(matchCandidate(product,{name:'AB 믹스 초코 125g 20개',brand:'A B'}).score<95);
});

test('a candidate title saying one item contradicts structured six-pack quantity', () => {
  const product = { name: '음료 400ml 6개', brand: '브랜드', spec: '400ml', quantity: '6개' };
  const candidate = { name: '음료 400ml 1개', brand: '브랜드', spec: '400ml', quantity: '6개' };
  const match = matchCandidate(product, candidate);
  assert.equal(match.hardMismatch, true);
  assert.ok(match.reasons.includes('QUANTITY_MISMATCH'));
  assert.equal(decidePrice({ match, observedPrice: 1000, previousPrice: 1000, reverified: true }).status, 'REJECT');
});

test('a candidate title size contradicting its spec is a hard mismatch', () => {
  const product = { name: '음료 400ml 6개', brand: '브랜드', spec: '400ml', quantity: '6개' };
  const candidate = { name: '음료 500ml 6개', brand: '브랜드', spec: '400ml', quantity: '6개' };
  const match = matchCandidate(product, candidate);
  assert.equal(match.hardMismatch, true);
  assert.ok(match.reasons.includes('SPEC_MISMATCH'));
});

test('per-item 500ml times 20 bottles agrees with a stated 10L total', () => {
  const product = { name: '생수 500ml × 20병', brand: '브랜드', spec: '500ml', quantity: '20병' };
  const candidate = { ...product, name: '생수 500ml × 20병, 총 10L' };
  const match = matchCandidate(product, candidate);
  assert.equal(match.score, 100);
  assert.equal(match.hardMismatch, false);
  assert.equal(decidePrice({ match, observedPrice: 1000, previousPrice: 1000, reverified: false }).status, 'ACCEPT');
});

test('a stated 9L total contradicts 500ml times 20 bottles', () => {
  const product = { name: '생수 500ml × 20병', brand: '브랜드', spec: '500ml', quantity: '20병' };
  const candidate = { ...product, name: '생수 500ml × 20병, 총 9L' };
  const match = matchCandidate(product, candidate);
  assert.equal(match.hardMismatch, true);
  assert.ok(match.reasons.includes('SPEC_MISMATCH'));
});

test('decimal per-item weights can equal an explicitly stated total', () => {
  const product = { name: '과자 33.3g × 3개', brand: '브랜드', spec: '33.3g', quantity: '3개' };
  const candidate = { ...product, name: '과자 33.3g × 3개, 총 99.9g' };
  const match = matchCandidate(product, candidate);
  assert.equal(match.hardMismatch, false);
  assert.equal(match.score, 100);
});

test('a product with no explicit count stays below automatic match threshold', () => {
  const product = { name: '로투스 비스코프 125g', brand: '로투스', spec: '125g' };
  const candidate = { ...product, name: '로투스 비스코프 125g 1개', quantity: '1개' };
  const match = matchCandidate(product, candidate);
  assert.equal(match.hardMismatch, false);
  assert.ok(match.score < 95);
});

test('missing unit cannot receive exact match credit', () => {
  const match = matchCandidate(biscuit, { ...biscuit, spec: '125' });
  assert.ok(match.score < 95);
  assert.equal(match.hardMismatch, false);
});

test('matching score thresholds classify 84, 85, 94, and 95', () => {
  const expected = [[84, 'REJECT'], [85, 'REVIEW'], [94, 'REVIEW'], [95, 'ACCEPT']];
  for (const [score, status] of expected) {
    assert.equal(decidePrice({ match: { score, hardMismatch: false, reasons: [] }, observedPrice: 1000, previousPrice: 1000, reverified: false }).status, status);
  }
});

test('20%, 20.01%, 40%, and 40.01% changes use the correct review gate', () => {
  const match = { score: 100, hardMismatch: false, reasons: [] };
  const classify = (observedPrice, reverified = false) => decidePrice({ match, observedPrice, previousPrice: 10000, reverified }).status;
  assert.equal(classify(12000), 'ACCEPT');
  assert.equal(classify(12001), 'REVERIFY');
  assert.equal(classify(14000), 'REVERIFY');
  assert.equal(classify(14001), 'REVIEW');
  assert.equal(classify(12001, true), 'ACCEPT');
  assert.equal(classify(14000, true), 'ACCEPT');
});

test('invalid prices and a missing previous price do not bypass validation', () => {
  const match = { score: 100, hardMismatch: false, reasons: [] };
  assert.equal(decidePrice({ match, observedPrice: 0, previousPrice: 10000, reverified: true }).status, 'REJECT');
  assert.equal(decidePrice({ match, observedPrice: 1000.5, previousPrice: 10000, reverified: true }).status, 'REJECT');
  assert.equal(decidePrice({ match, observedPrice: 1000, previousPrice: null, reverified: false }).status, 'ACCEPT');
});
