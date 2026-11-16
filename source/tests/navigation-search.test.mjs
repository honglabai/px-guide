import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=route=>fs.readFileSync(`dist/client/${route}index.html`,'utf8');
test('only home and product catalog expose product search in their requested positions',()=>{
 const pages=fs.readdirSync('dist/client',{recursive:true}).filter(p=>p.endsWith('index.html'));
 const withSearch=pages.filter(p=>fs.readFileSync('dist/client/'+p,'utf8').includes('class="shop-search"')).sort();
 assert.deepEqual(withSearch,['index.html','products/index.html']);
 const home=html(''),catalog=html('products/');
 assert(home.indexOf('class="shop-search"')>home.indexOf('class="home-shuffle"'));
 assert(home.indexOf('class="shop-search"')<home.indexOf('class="home-section home-deals"'));
 assert(catalog.indexOf('class="shop-search"')<catalog.indexOf('class="category-tabs"'));
 for(const route of ['favorites/','shopping/'])assert(!html(route).includes('type="search"'));
});
test('five navigation tabs and footer retain the intended destinations',()=>{
 for(const route of ['','monthly/','products/','nearby/','guides/','favorites/','shopping/']){
  const page=html(route),nav=page.match(/<nav class="shop-nav"[\s\S]*?<\/nav>/)[0];
  assert.deepEqual([...nav.matchAll(/href="([^"]+)"[^>]*><span[^>]*><\/span>([^<]+)<\/a>/g)].map(m=>[m[1],m[2]]),[['/','홈'],['/products/','전체 상품'],['/monthly/','이달의 할인'],['/nearby/','가까운 PX'],['/contact/','문의']]);
  assert(page.includes('<div class="footer-title"><a href="/guides/">PX 구매 가이드</a>'));
 }
 assert(html('guides/').includes('id="category-guides"'));
 assert(!html('products/').includes('확인가가 없으면 날짜가 적힌 이전 기록'));
 assert(!html('products/').includes('쿠팡 확인가는 시점에 따라 달라집니다.'));
 for(const route of ['monthly/','products/','nearby/'])assert(!html(route).match(/<section class="pagehead"/));
});

test('home omits the guide section while the footer still opens the complete guide page',()=>{
 const home=html('');assert(!home.includes('home-guides-title'));assert(!home.includes('03 / BUYING GUIDE'));assert(home.includes('<div class="footer-title"><a href="/guides/">PX 구매 가이드</a>'));assert(html('guides/').includes('id="category-guides"'));assert.equal((home.match(/data-shuffle-slide/g)||[]).length,5);
});

test('feature banner appears in both the top carousel and below products',()=>{const home=html('');const carousel=home.match(/<section class="home-shuffle"[\s\S]*?<\/section>/)?.[0];assert(carousel);assert.match(carousel,/class="shuffle-slide shuffle-features shuffle-image-banner" data-shuffle-slide/);assert.match(carousel,/px-features-banner-v1-768.webp/);for(const feature of ['상품·가격 비교','이달의 할인','찜·장바구니','구매목록 전달'])assert(carousel.includes(feature));const lower=home.match(/<aside class="home-coupang-ad"[\s\S]*?<\/aside>/)?.[0];assert(lower);assert.match(lower,/px-features-banner-v1-768.webp/);assert(home.indexOf(lower)>home.indexOf('class="home-section home-products"'));assert.equal(home.split('src="/images/home/px-features-banner-v1-768.webp"').length-1,2);});

test('monthly pages omit source-check status but retain every monthly archive link',()=>{for(const path of ['monthly/','monthly/2026-10/','monthly/2026-09/']){const page=html(path);assert(!page.includes('<h2>자료 확인 현황</h2>'));assert(page.includes('월별 할인 게시물'));assert(page.includes('href="/monthly/2026-10/"'));assert(page.includes('href="/monthly/2026-09/"'));}});
