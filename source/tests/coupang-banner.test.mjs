import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('Coupang banner launches Android app through a user-clickable intent with a web fallback',async()=>{
 const m=await import('../coupang-banner.js').catch(()=>({}));assert.equal(typeof m.coupangBannerUrl,'function');
 const uri=m.coupangBannerUrl('Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36');
 assert.match(uri,/^intent:\/\/www\.coupang\.com\/#Intent;/);assert.match(uri,/package=com\.coupang\.mobile/);assert.match(uri,/scheme=https/);assert.match(uri,/S\.browser_fallback_url=https%3A%2F%2Fwww\.coupang\.com%2F/);
 assert.equal(m.coupangBannerUrl('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'),'https://www.coupang.com/');assert.equal(m.coupangBannerUrl('Mozilla/5.0 (Macintosh; Intel Mac OS X)'),'https://www.coupang.com/');
 const a={href:'https://www.coupang.com/'};m.configureCoupangBanner({querySelectorAll:()=>[a]},{userAgent:'Android Chrome'});assert.equal(a.href,uri);
});
test('home preserves its existing three banners and adds a fourth responsive Coupang banner',()=>{
 const html=fs.readFileSync('dist/client/index.html','utf8'),section=html.match(/<section class="home-shuffle"[\s\S]*?<\/section>/)?.[0];
 assert.equal((section.match(/data-shuffle-slide/g)||[]).length,5);assert.match(section,/data-coupang-banner/);assert.match(section,/href="https:\/\/www\.coupang\.com\/"/);assert.match(section,/coupang-price-compare-optimized-v1-768.webp/);assert.match(section,/coupang-price-compare-optimized-v1-480.avif/);assert.match(html,/src="\/coupang-banner.js"/);
 for(const size of [480,768,1536,2172])for(const ext of ['webp','avif']){const bytes=fs.readFileSync(`dist/client/images/home/coupang-price-compare-optimized-v1-${size}.${ext}`);assert.ok(bytes.length<300000);if(ext==='avif')assert.equal(bytes.subarray(4,12).toString(),'ftypavif');else assert.equal(bytes.subarray(8,12).toString(),'WEBP');}
});

test('all direct and dynamically inserted Coupang links use app-first anchors without popups or timers',async()=>{
 const {configureCoupangLinks}=await import('../coupang-banner.js');
 const link=url=>({href:url,target:'_blank',removeAttribute(name){if(name==='target')this.target='';}});
 const a=link('https://www.coupang.com/np/search?q=hello'),other=link('https://example.test/');let capture;
 configureCoupangLinks({querySelectorAll:()=>[a,other],addEventListener(name,fn,useCapture){assert.equal(name,'click');assert.equal(useCapture,true);capture=fn;}},{userAgent:'Android Chrome'});
 assert.match(a.href,/^intent:/);assert.equal(a.target,'');assert.equal(other.href,'https://example.test/');assert.equal(other.target,'_blank');
 const added=link('https://www.coupang.com/vp/products/123');capture({target:{closest:()=>added}});assert.match(added.href,/^intent:/);assert.match(added.href,/S.browser_fallback_url=https%3A%2F%2Fwww.coupang.com%2Fvp%2Fproducts%2F123/);assert.equal(added.target,'');
 const ios=link('https://www.coupang.com/np/search?q=hello');configureCoupangLinks({querySelectorAll:()=>[ios],addEventListener(){}},{userAgent:'iPhone'});assert.equal(ios.href,'https://www.coupang.com/np/search?q=hello');assert.equal(ios.target,'');
});
