import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import worker from '../worker/index.js';

const home=fs.readFileSync('dist/client/index.html','utf8');
const launch=fs.readFileSync('dist/client/launch/index.html','utf8');
test('installed-app launch redirects once without changing normal browser navigation',()=>{
  const script=home.match(/<script>(try\{if\(\(matchMedia[\s\S]*?)<\/script>/)[1];
  for(const standalone of [true,false]){
    const saved=new Map(),routes=[];
    const context={matchMedia:()=>({matches:standalone}),navigator:{},sessionStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},location:{replace:p=>routes.push(p)}};
    vm.runInNewContext(script,context);vm.runInNewContext(script,context);
    assert.deepEqual(routes,standalone?['/launch/']:[]);
  }
  assert.doesNotThrow(()=>vm.runInNewContext(script,{matchMedia:()=>({matches:true}),navigator:{},sessionStorage:{getItem(){throw Error('blocked')}},location:{replace(){throw Error('must not loop')}}}));
  assert.equal(JSON.parse(fs.readFileSync('manifest.webmanifest')).start_url,'/launch/');
  assert.match(launch,/class="start" href="\/"/);
  assert.doesNotMatch(launch,/setTimeout|favorites\.js|product-catalog\.js/);
});
test('all responsive artwork URLs exist and mobile image payloads stay small',()=>{
  for(const html of [home,launch])for(const match of html.matchAll(/\/(?:icons|images\/home)\/[\w-]+-optimized-v1-\d+\.(?:avif|webp)/g))assert.ok(fs.existsSync('dist/client'+match[0]),match[0]);
  assert.ok(fs.statSync('dist/client/icons/mobile-launch-2026-optimized-v1-941.avif').size<90000);
  for(const name of ['october-sale-banner-2026','product-catalog-banner-2026-v2','shopping-guide-banner-2026'])assert.ok(fs.statSync(`dist/client/images/home/${name}-optimized-v1-768.avif`).size<25000);
});
test('versioned brand images cache, while launch HTML remains fresh',async()=>{
  const env={ASSETS:{fetch:async()=>new Response('asset')}};
  const image=await worker.fetch(new Request('https://example.com/icons/mobile-launch-2026-optimized-v1-720.avif'),env);
  assert.match(image.headers.get('cache-control'),/immutable/);
  const page=await worker.fetch(new Request('https://example.com/launch/'),env);
  assert.equal(page.headers.get('cache-control'),null);
});
